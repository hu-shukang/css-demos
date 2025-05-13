/**
 * Create Auth Challenge Lambda
 * Generates a custom challenge, e.g., sends an OTP via email.
 */
const createAuthChallenge = async (
  event: CreateAuthChallengeTriggerEvent
): Promise<CreateAuthChallengeTriggerEvent> => {
  logger.info('CreateAuthChallenge event:', { event });

  const SENDER_EMAIL_ADDRESS = process.env.SENDER_EMAIL_ADDRESS;
  const SUBJECT = '確認コード通知'; // "Verification Code Notification"
  const BODY_TEMPLATE = 'こちらのコードでサインインしてください: %s'; // "Please sign in with this code: %s"

  if (!SENDER_EMAIL_ADDRESS) {
    logger.error('SENDER_EMAIL_ADDRESS environment variable is not set.');
    throw new Error('Email service configuration error.'); // This will cause Lambda to fail
  }

  const userAttributes = event.request.userAttributes;
  const emailAddress = userAttributes?.email;

  if (!emailAddress) {
    logger.error('Email address not found in user attributes.');
    throw new EmailNotFoundException(); // Custom exception
  }

  // Generate a 6-digit OTP
  const code = randomInt(0, 999999).toString().padStart(6, '0');
  const mailBody = BODY_TEMPLATE.replace('%s', code);

  const sendEmailParams = {
    Destination: { ToAddresses: [emailAddress] },
    Message: {
      Body: { Text: { Data: mailBody, Charset: 'UTF-8' } },
      Subject: { Data: SUBJECT, Charset: 'UTF-8' },
    },
    Source: SENDER_EMAIL_ADDRESS,
  };

  try {
    const emailResponse = await sesClient.send(new SendEmailCommand(sendEmailParams));
    logger.info('Email sent successfully.', { messageId: emailResponse.MessageId });
  } catch (error) {
    logger.error('Failed to send email via SES.', error as Error);
    throw new EmailNotDeliveredException(); // Custom exception
  }

  event.response.publicChallengeParameters = {}; // No public parameters in Python version
  event.response.privateChallengeParameters = { code }; // Store OTP for verification
  event.response.challengeMetadata = 'CUSTOM_CHALLENGE_OTP'; // Optional: metadata for the challenge

  return event;
};
