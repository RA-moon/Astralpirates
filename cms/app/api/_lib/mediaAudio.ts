const AUDIO_ENABLED_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const isMediaAudioEnabled = (): boolean => {
  const value = (process.env.MEDIA_AUDIO_ENABLED ?? '').trim().toLowerCase();
  return AUDIO_ENABLED_TRUE_VALUES.has(value);
};
