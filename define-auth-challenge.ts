import {
  DefineAuthChallengeTriggerEvent,
  // Ensure you have these specific types if not already, or use the general CognitoUserPoolTriggerEvent and cast
} from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger'; // Assuming you use this

const logger = new Logger(); // Or however you initialize

// Helper to get the last successful challenge name from the session
const getLastSuccessfulChallenge = (session: DefineAuthChallengeTriggerEvent['request']['session'] | undefined): string | null => {
  if (!session || session.length === 0) return null;
  // Find the last challenge that was successful and was not a setup step like SRP_A
  for (let i = session.length - 1; i >= 0; i--) {
    if (session[i].challengeResult === true && session[i].challengeName !== 'SRP_A') { // SRP_A is a setup, not a user completion
      return session[i].challengeName;
    }
    // If PASSWORD_VERIFIER was the last and it was true, it's a success for that step
    if (session[i].challengeName === 'PASSWORD_VERIFIER' && session[i].challengeResult === true) return session[i].challengeName;
  }
  return null;
};


export const defineAuthChallenge = (
  event: DefineAuthChallengeTriggerEvent
): DefineAuthChallengeTriggerEvent => {
  logger.info('DefineAuthChallenge event:', { event });

  const session = event.request.session || []; // Ensure session is an array
  const response = event.response;

  const userStatus = event.request.userAttributes?.['cognito:user_status'];
  const needsPasswordChange = userStatus === 'FORCE_CHANGE_PASSWORD';

  // Default to not issuing tokens and not failing, let the logic decide
  response.issueTokens = false;
  response.failAuthentication = false;

  // --- Scenario 1: User needs to set a new password (e.g., AdminCreateUser) ---
  if (needsPasswordChange) {
    logger.info('User is in FORCE_CHANGE_PASSWORD state.');
    const lastSuccessfulStep = getLastSuccessfulChallenge(session);

    if (session.length === 0 || !lastSuccessfulStep) {
      // If no steps completed, or only SRP_A, and password change needed:
      // First step for this user: Send OTP (your CUSTOM_CHALLENGE)
      logger.info('Issuing CUSTOM_CHALLENGE (OTP) as first step for password change flow.');
      response.challengeName = 'CUSTOM_CHALLENGE';
    } else if (lastSuccessfulStep === 'CUSTOM_CHALLENGE') {
      // OTP was successful. Now prompt for new password.
      logger.info('CUSTOM_CHALLENGE (OTP) was successful. Issuing NEW_PASSWORD_REQUIRED.');
      response.challengeName = 'NEW_PASSWORD_REQUIRED';
    } else if (lastSuccessfulStep === 'NEW_PASSWORD_REQUIRED') {
      // New password successfully set. Issue tokens.
      logger.info('NEW_PASSWORD_REQUIRED was successful. Issuing tokens.');
      response.issueTokens = true;
    } else if (session.length > 0 && session[session.length-1].challengeResult === false) {
        logger.warn('A challenge failed in the FORCE_CHANGE_PASSWORD flow.');
        response.failAuthentication = true;
    }
     else {
      // Unexpected state in password change flow
      logger.warn('Unexpected state in FORCE_CHANGE_PASSWORD flow.', { session });
      response.failAuthentication = true;
    }
  }
  // --- Scenario 2: Regular SRP Authentication Flow ---
  // (This assumes your 'CUSTOM_CHALLENGE' is the OTP part of a normal SRP login)
  else if (session.length === 0 && event.request.userNotFound !== true ) { // User exists, no session, implies start of a new flow
    // For SRP, Cognito issues SRP_A first. This lambda is called *after* SRP_A.
    // So, if session is empty here, it's likely not an SRP flow, or it's the very first call *for* SRP.
    // If your user pool client allows CUSTOM_AUTH directly, this could be its starting point.
    // Let's assume for now that Cognito handles SRP_A initiation and then calls this.
    // If it's the very first call and Cognito expects *us* to start SRP, that's different.
    // But usually, Cognito sends SRP_A if SRP is enabled.
    // If you want a non-SRP flow to start with OTP:
    logger.info('Starting a non-SRP flow or first call. Assuming Cognito handles SRP_A or this is custom. Issuing CUSTOM_CHALLENGE (OTP).');
    response.challengeName = 'CUSTOM_CHALLENGE';

  } else if (session.length > 0) {
    const currentChallengeDetails = session[session.length - 1];
    const challengeName = currentChallengeDetails.challengeName;
    const challengeResult = currentChallengeDetails.challengeResult;

    if (!challengeResult) {
        logger.warn(`Challenge ${challengeName} failed.`);
        response.failAuthentication = true;
        return event;
    }

    // SRP Flow continuation
    if (challengeName === 'SRP_A') {
      logger.info('SRP_A successful. Moving to PASSWORD_VERIFIER.');
      response.challengeName = 'PASSWORD_VERIFIER';
    } else if (challengeName === 'PASSWORD_VERIFIER') {
      logger.info('PASSWORD_VERIFIER successful. Moving to CUSTOM_CHALLENGE (OTP).');
      response.challengeName = 'CUSTOM_CHALLENGE'; // Your OTP challenge
    } else if (challengeName === 'CUSTOM_CHALLENGE') {
      // This is the OTP. If successful, and no password change needed, issue tokens.
      logger.info('CUSTOM_CHALLENGE (OTP) successful. Issuing tokens.');
      response.issueTokens = true;
    } else {
      // Unknown state in SRP or general flow
      logger.warn('Unknown challenge state in session.', { session });
      response.failAuthentication = true;
    }
  } else if (event.request.userNotFound) {
    logger.warn('User not found.');
    response.failAuthentication = true; // Standard behavior
  }
   else {
    // Should not be reached if logic above is comprehensive
    logger.error('Reached unexpected part of defineAuthChallenge logic.');
    response.failAuthentication = true;
  }

  // Ensure failAuthentication is explicitly true if not issuing tokens and no next challenge
  if (!response.issueTokens && !response.challengeName && !response.failAuthentication) {
    logger.info('No tokens to issue and no next challenge, but not explicitly failed. Setting failAuthentication to true.');
    response.failAuthentication = true;
  }


  logger.info('DefineAuthChallenge response:', { response });
  return event;
};
