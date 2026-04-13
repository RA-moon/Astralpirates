import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import CrewPortrait from '~/components/CrewPortrait.vue';
import { AVATAR_FALLBACK_IMAGE_URL } from '~/modules/media/avatarUrls';

describe('CrewPortrait', () => {
  it('uses bundled fallback image when avatar URL is missing', () => {
    const wrapper = mount(CrewPortrait, {
      props: {
        callSign: 'Captain',
        avatarUrl: null,
      },
    });

    const image = wrapper.find('.avatar-media__image');
    expect(image.exists()).toBe(true);
    expect(image.attributes('src')).toBe(AVATAR_FALLBACK_IMAGE_URL);
  });
});
