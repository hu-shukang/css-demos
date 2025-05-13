import { CognitoUserPoolTriggerEvent, CognitoUserPoolTriggerHandler } from 'aws-lambda';

export const handler: CognitoUserPoolTriggerHandler = async (event) => {
  // 仅在验证阶段执行
  if (event.triggerSource !== 'VerifyAuthChallengeResponse_Authentication') {
    return event;
  }

  if (event.request.challengeName === 'CUSTOM_CHALLENGE') {
    const answer = event.request.challengeAnswer || '';
    const username = event.userName;

    // 检查新密码是否包含用户名（不区分大小写）
    const containsUsername = answer
      .toLowerCase()
      .includes(username.toLowerCase());

    event.response.answerCorrect = !containsUsername;
  }

  return event;
};
