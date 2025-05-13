import {
  CognitoUserPoolTriggerEvent,
  CognitoUserPoolTriggerHandler,
} from 'aws-lambda';

export const handler: CognitoUserPoolTriggerHandler = async (event) => {
  if (event.triggerSource !== 'CreateAuthChallenge_Authentication') {
    return event;
  }

  if (event.request.challengeName === 'CUSTOM_CHALLENGE') {
    const username = event.userName;
    event.response.publicChallengeParameters = {
      prompt: `请重置您的密码，且新密码中不得包含用户名（${username}）。`,
    };
    event.response.privateChallengeParameters = {}; // 你也可以存期望值
    event.response.challengeMetadata = 'PASSWORD_RESET';
  }

  return event;
};
