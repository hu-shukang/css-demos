/**
 * Verify Auth Challenge Response Lambda
 * Verifies the user's answer to a custom challenge.
 */
const verifyAuthChallengeResponse = (
  event: VerifyAuthChallengeResponseTriggerEvent
): VerifyAuthChallengeResponseTriggerEvent => {
  logger.info('VerifyAuthChallengeResponse event:', { event });

  const expectedAnswer = event.request.privateChallengeParameters.code;
  const providedAnswer = event.request.challengeAnswer;

  if (providedAnswer === expectedAnswer) {
    logger.info('Challenge answer verified successfully.');
    event.response.answerCorrect = true;
  } else {
    logger.warn('Challenge answer verification failed.');
    event.response.answerCorrect = false;
  }

  return event;
};

/**
 * Main Lambda Handler
 * Routes the event to the appropriate challenge handler based on the triggerSource.
 */
export const handler: Handler<CognitoUserPoolTriggerEvent, any> = async (
  event: CognitoUserPoolTriggerEvent,
  context: Context
): Promise<any> => {
  // Inject context for AWS Lambda Powertools Logger
  logger.addContext(context);
  logger.info('Lambda_handler event:', { event });

  let response;

  // Determine the specific trigger source (DefineAuthChallenge, CreateAuthChallenge, etc.)
  // Example triggerSource: "DefineAuthChallenge_Authentication"
  const triggerSourceType = event.triggerSource.split('_')[0];

  // Add handler name to structured logs
  logger.appendKeys({ handler_name: triggerSourceType });


  switch (triggerSourceType) {
    case 'DefineAuthChallenge':
      response = defineAuthChallenge(event as DefineAuthChallengeTriggerEvent);
      break;
    case 'CreateAuthChallenge':
      // CreateAuthChallenge is async due to SES call
      response = await createAuthChallenge(event as CreateAuthChallengeTriggerEvent);
      break;
    case 'VerifyAuthChallengeResponse':
      response = verifyAuthChallengeResponse(event as VerifyAuthChallengeResponseTriggerEvent);
      break;
    default:
      logger.error('Invalid Cognito trigger source.', { triggerSource: event.triggerSource });
      throw new Error(`Unhandled trigger source: ${event.triggerSource}`);
  }

  logger.info('Handler response:', { response });
  return response;
};
