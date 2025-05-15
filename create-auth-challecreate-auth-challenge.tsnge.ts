// amplify/auth/create-auth-challenge.ts
import type { CreateAuthChallengeTriggerHandler } from 'aws-lambda';

export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  console.log('Create Auth Challenge Trigger:', JSON.stringify(event, null, 2));

  if (event.request.challengeName === 'CUSTOM_CHALLENGE') {
    // 这是我们为首次登录定义的挑战
    // 可以根据 event.request.session 来实现多步骤的首次登录挑战
    // 例如，第一步：设置密码；第二步：同意T&C

    // 假设我们的首次登录挑战是要求用户设置一个新密码
    event.response.publicChallengeParameters = {
      challengeType: 'INITIAL_SETUP_NEW_PASSWORD', // 告诉客户端这是什么类型的挑战
      username: event.request.userAttributes.email || event.userName, // 方便客户端显示
    };
    // privateChallengeParameters 可以用来存储一些后续验证需要的信息，但在此简单示例中可能不需要
    event.response.privateChallengeParameters = {};
    event.response.privateChallengeParameters.answer = 'dummy-answer'; // 实际中不会这样硬编码答案

    // challengeMetadata 可以用于追踪流程，例如第几步
    event.response.challengeMetadata = `SESSION_${event.request.session.length}_CHALLENGE_NEW_PASSWORD`;
  }
  console.log('Returning event:', JSON.stringify(event, null, 2));
  return event;
};
