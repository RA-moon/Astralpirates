import type { Payload } from 'payload';

import { EMAIL_TRANSPORT_COOLDOWN_MS } from './authMailConfig';
import { markEmailTransportFailure, markEmailTransportRecovered } from '../invitations/transportState';
import { captureTransportError, isSmtpAuthFailure } from '@/src/utils/emailTransport';

type MailContent = {
  subject: string;
  text: string;
  html: string;
};

type DispatchAuthMailOptions = {
  payload: Payload;
  to: string;
  content: MailContent;
  cooldownMs?: number;
};

export const dispatchAuthMail = async (options: DispatchAuthMailOptions): Promise<void> => {
  const { payload, to, content } = options;
  const cooldownMs = options.cooldownMs ?? EMAIL_TRANSPORT_COOLDOWN_MS;

  try {
    await payload.sendEmail({
      to,
      ...content,
    });
    await markEmailTransportRecovered();
  } catch (error) {
    if (isSmtpAuthFailure(error)) {
      await markEmailTransportFailure({
        snapshot: captureTransportError(error),
        cooldownMs,
      });
    }
    throw error;
  }
};
