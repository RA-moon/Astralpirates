import authTemplates from './en/auth.json';

type TemplateDefinition = {
  subject: string;
  text: string | string[];
  html: string | string[];
};

type TemplateMap = {
  passwordReset: TemplateDefinition;
  recruitInvite: TemplateDefinition;
  requestInvite: TemplateDefinition;
};

const templates = authTemplates as TemplateMap;

const normaliseContent = (segment: string | string[]): string =>
  Array.isArray(segment) ? segment.join('\n') : segment;

const renderSegment = (template: string, params: Record<string, string>): string =>
  template.replace(/\{\{([^}]+)\}\}/g, (_, keyRaw) => {
    const key = keyRaw.trim();
    return params[key] ?? '';
  });

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

type RecruitInviteParams = {
  firstName: string;
  lastName: string;
  inviterLabel: string;
  inviteLink: string;
  expiresAt: string;
};

type PasswordResetParams = {
  firstName: string;
  lastName: string;
  resetLink: string;
  expiresAt: string;
};

type RequestInviteParams = {
  inviteLink: string;
  expiresAt: string;
};

const renderTemplate = (template: TemplateDefinition, params: Record<string, string>) => {
  const htmlParams = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, escapeHtml(value)]),
  ) as Record<string, string>;

  return {
    subject: renderSegment(template.subject, params),
    text: renderSegment(normaliseContent(template.text), params),
    html: renderSegment(normaliseContent(template.html), htmlParams),
  };
};

export const renderRecruitInviteEmail = (params: RecruitInviteParams) =>
  renderTemplate(templates.recruitInvite, params);

export const renderPasswordResetEmail = (params: PasswordResetParams) =>
  renderTemplate(templates.passwordReset, params);

export const renderRequestInviteEmail = (params: RequestInviteParams) =>
  renderTemplate(templates.requestInvite, params);
