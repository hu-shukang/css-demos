import {
  CognitoUserPoolTriggerEvent,
  CognitoUserPoolTriggerHandler,
} from 'aws-lambda';

export const handler: CognitoUserPoolTriggerHandler = async (event) => {
  if (event.triggerSource !== 'VerifyAuthChallengeResponse_Authentication') {
    return event;
  }

  if (event.request.challengeName === 'CUSTOM_CHALLENGE') {
    const answer = event.request.challengeAnswer || '';
    const username = event.userName;
    // 密码里不能包含用户名
    event.response.answerCorrect = !answer
      .toLowerCase()
      .includes(username.toLowerCase());
  }

  return event;
};
