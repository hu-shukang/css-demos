import {
  CognitoUserPoolTriggerEvent,
  CognitoUserPoolTriggerHandler,
} from 'aws-lambda';

export const handler: CognitoUserPoolTriggerHandler = async (event) => {
  // 只在认证流程里生效
  if (event.triggerSource !== 'DefineAuthChallenge_Authentication') {
    return event;
  }

  const session = event.request.session || [];

  if (session.length === 0) {
    // 第一次调用：让 Cognito 继续走 SRP 握手（不要下发 CUSTOM_CHALLENGE）
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    // 不设置 challengeName，Cognito 会用默认的 USER_SRP_AUTH
  } else {
    const last = session[session.length - 1];

    // 如果 SRP 握手已经走完（PASSWORD_VERIFIER 成功），开始自定义挑战
    const passedSrp =
      session.some(
        (s) =>
          s.challengeName === 'PASSWORD_VERIFIER' &&
          s.challengeResult === true
      ) && !session.some((s) => s.challengeName === 'CUSTOM_CHALLENGE');

    if (passedSrp) {
      event.response.issueTokens = false;
      event.response.failAuthentication = false;
      event.response.challengeName = 'CUSTOM_CHALLENGE';
    }
    // 自定义挑战通过：发 Token
    else if (last.challengeName === 'CUSTOM_CHALLENGE' && last.challengeResult) {
      event.response.issueTokens = true;
      event.response.failAuthentication = false;
    }
    // 自定义挑战失败超过次数：拒绝
    else if (
      last.challengeName === 'CUSTOM_CHALLENGE' &&
      last.challengeResult === false &&
      session.filter((s) => s.challengeName === 'CUSTOM_CHALLENGE').length >= 3
    ) {
      event.response.issueTokens = false;
      event.response.failAuthentication = true;
    }
    // 其他情况：重试自定义挑战
    else {
      event.response.issueTokens = false;
      event.response.failAuthentication = false;
      event.response.challengeName = 'CUSTOM_CHALLENGE';
    }
  }

  return event;
};
