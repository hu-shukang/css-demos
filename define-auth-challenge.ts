/**
 * Define Auth Challenge Lambda
 * Determines the next step in the authentication flow.
 * This specific Python logic assumes a fixed sequence: SRP_A -> PASSWORD_VERIFIER -> CUSTOM_CHALLENGE.
 */
const defineAuthChallenge = (
  event: DefineAuthChallengeTriggerEvent
): DefineAuthChallengeTriggerEvent => {
  logger.info('DefineAuthChallenge event:', { event });

  const session = event.request.session;
  const response = event.response;

  // If session is empty, this logic might not behave as expected from the Python code,
  // as Python's session[-1] on an empty list raises IndexError.
  // AWS Cognito ensures session is an array. If it's the start of CUSTOM_AUTH without SRP, it's empty.
  // If it's SRP_A, it will have one entry.
  // The Python code's `challenges` array starting with "SRP_A" implies an SRP-based flow.
  if (!session || session.length === 0) {
      // This case needs to be handled based on your auth flow.
      // If it's CUSTOM_WITH_SRP, session should not be empty here (should contain SRP_A).
      // If it's pure CUSTOM_AUTH, and this is the first step, you'd typically issue CUSTOM_CHALLENGE.
      // For this direct translation, if session is unexpectedly empty, we'll fail.
      logger.warn('Session is empty or undefined, failing authentication.');
      response.issueTokens = false;
      response.failAuthentication = true;
      return event;
  }

  const currentChallengeIndex = session.length - 1;
  const expectedChallenges = ['SRP_A', 'PASSWORD_VERIFIER', 'CUSTOM_CHALLENGE'];

  // Check if the current challenge index is out of bounds for the expected sequence
  if (currentChallengeIndex >= expectedChallenges.length) {
      logger.warn('Current challenge index exceeds expected challenge sequence length.', { currentChallengeIndex, expectedChallengesLength: expectedChallenges.length });
      response.issueTokens = false;
      response.failAuthentication = true;
      return event;
  }

  const currentSessionChallenge = session[currentChallengeIndex];

  // NOTE: 不正な名称のチャレンジがリクエストされた場合は認証失敗とする。
  // (If a challenge with an invalid name is requested, authentication fails.)
  if (expectedChallenges[currentChallengeIndex] !== currentSessionChallenge.challengeName) {
    logger.warn('Challenge name mismatch.', {
      expected: expectedChallenges[currentChallengeIndex],
      actual: currentSessionChallenge.challengeName,
    });
    response.issueTokens = false;
    response.failAuthentication = true;
    return event;
  }

  if (
    currentChallengeIndex === expectedChallenges.length - 1 && // It's the last expected challenge
    currentSessionChallenge.challengeResult === true
  ) {
    // Successfully completed the final challenge in the sequence
    logger.info('Final challenge successful. Issuing tokens.');
    response.issueTokens = true;
    response.failAuthentication = false;
  } else if (
    currentChallengeIndex < expectedChallenges.length - 1 && // Not the last challenge
    currentSessionChallenge.challengeResult === true
  ) {
    // Successfully completed an intermediate challenge, move to the next one
    const nextChallengeName = expectedChallenges[currentChallengeIndex + 1];
    logger.info(`Intermediate challenge successful. Moving to next challenge: ${nextChallengeName}`);
    response.issueTokens = false;
    response.failAuthentication = false;
    response.challengeName = nextChallengeName;
  } else {
    // Challenge failed or unexpected state
    logger.warn('Challenge failed or unexpected state.', {
        challengeResult: currentSessionChallenge.challengeResult,
        currentChallengeIndex,
    });
    response.issueTokens = false;
    response.failAuthentication = true;
  }

  return event;
};
