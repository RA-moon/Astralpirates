import { render, screen } from '@testing-library/vue';
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import CrewRoster from '~/components/CrewRoster.vue';

vi.mock('~/stores/crew', () => {
  const members = ref([
    {
      profileSlug: 'captain',
      displayName: 'Captain',
      callSign: 'Captain',
      role: 'captain',
      avatarUrl: null,
      isOnline: true,
    },
  ]);
  const status = ref('ready');
  return {
    useCrewStore: () => ({
      members,
      status,
      fetchMembers: vi.fn().mockResolvedValue(members.value),
    }),
  };
});

describe('CrewRoster', () => {
  it('renders crew members', async () => {
    render(CrewRoster, { props: { mode: 'preview' } });
    expect(await screen.findByText(/Latest on deck/)).toBeTruthy();
  });
});
