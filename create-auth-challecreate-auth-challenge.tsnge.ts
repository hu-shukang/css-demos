import { CognitoUserPoolTriggerEvent, CognitoUserPoolTriggerHandler } from 'aws-lambda';

export const handler: CognitoUserPoolTriggerHandler = async (event) => {
  // 仅在 CUSTOM_CHALLENGE 创建阶段执行
  if (event.triggerSource !== 'CreateAuthChallenge_Authentication') {
    return event;
  }

  if (event.request.challengeName === 'CUSTOM_CHALLENGE') {
    const username = event.userName;
    // 将提示发送给客户端
    event.response.publicChallengeParameters = {
      prompt: `请重置您的密码，且新密码中不得包含用户名（${username}）。`
    };
    // 私有参数可留空，或用于存储期望值
    event.response.privateChallengeParameters = {};
    // 用于标记此次挑战类型
    event.response.challengeMetadata = 'PASSWORD_RESET';
  }

  return event;
};
