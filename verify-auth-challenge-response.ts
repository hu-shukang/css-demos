// amplify/auth/verify-auth-challenge-response.ts
import type { VerifyAuthChallengeResponseTriggerHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminSetUserPasswordCommand, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({});

export const handler: VerifyAuthChallengeResponseTriggerHandler = async (event) => {
  console.log('Verify Auth Challenge Response Trigger:', JSON.stringify(event, null, 2));

  // 确保这是我们发起的自定义挑战的响应
  // event.request.privateChallengeParameters.answer 可以用来做一些简单的校验，但对于密码设置，核心是调用Admin API
  const expectedChallengeType = event.request.publicChallengeParameters?.challengeType; // 从 Create Auth Challenge 获取

  if (expectedChallengeType === 'INITIAL_SETUP_NEW_PASSWORD') {
    const providedPassword = event.request.challengeAnswer;

    // 1. 验证密码复杂度 (示例，您需要实现自己的逻辑)
    if (!providedPassword || providedPassword.length < 8) {
      console.log('Password does not meet complexity requirements.');
      event.response.answerCorrect = false;
      return event;
    }

    try {
      // 2. 为用户设置新密码并标记为永久
      const setUserPasswordParams = {
        UserPoolId: event.userPoolId,
        Username: event.userName,
        Password: providedPassword,
        Permanent: true, // 非常重要，将密码设置为永久
      };
      await cognitoClient.send(new AdminSetUserPasswordCommand(setUserPasswordParams));
      console.log('Successfully set user password permanently.');

      // 3. 更新用户属性，标记首次设置已完成
      const updateUserAttributesParams = {
        UserPoolId: event.userPoolId,
        Username: event.userName,
        UserAttributes: [
          {
            Name: 'custom:needs_initial_setup',
            Value: 'false',
          },
        ],
      };
      await cognitoClient.send(new AdminUpdateUserAttributesCommand(updateUserAttributesParams));
      console.log('Successfully updated custom:needs_initial_setup attribute.');

      event.response.answerCorrect = true;
    } catch (error) {
      console.error('Error in Verify Auth Challenge:', error);
      event.response.answerCorrect = false;
    }
  } else {
    console.log('Unknown challenge type or not a custom challenge response.');
    event.response.answerCorrect = false;
  }
  console.log('Returning event:', JSON.stringify(event, null, 2));
  return event;
};
