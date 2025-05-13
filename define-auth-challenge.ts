import { CognitoUserPoolTriggerEvent, CognitoUserPoolTriggerHandler } from 'aws-lambda';

export const handler: CognitoUserPoolTriggerHandler = async (event) => {
  // 仅针对自定义认证触发
  if (event.triggerSource !== 'DefineAuthChallenge_Authentication') {
    return event;
  }

  const session = event.request.session || [];

  if (session.length === 0) {
    // 初次请求，发起 CUSTOM_CHALLENGE
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
  } else {
    const last = session[session.length - 1];
    if (last.challengeName === 'CUSTOM_CHALLENGE' && last.challengeResult === true) {
      // 上一次自定义挑战通过，发放 Tokens
      event.response.issueTokens = true;
      event.response.failAuthentication = false;
    } else if (
      last.challengeName === 'CUSTOM_CHALLENGE' &&
      last.challengeResult === false &&
      session.length >= 3
    ) {
      // 连续三次失败则拒绝认证
      event.response.issueTokens = false;
      event.response.failAuthentication = true;
    } else {
      // 挑战未通过但未达最大次数，继续发起挑战
      event.response.issueTokens = false;
      event.response.failAuthentication = false;
      event.response.challengeName = 'CUSTOM_CHALLENGE';
    }
  }

  return event;
};
