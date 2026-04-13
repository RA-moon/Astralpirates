<template>
  <UiStack>
    <UiFormField label="Crew roles">
      <template #default>
        <UiStack>
          <UiCheckbox v-model="mayInvite">Allow invitations</UiCheckbox>
          <UiCheckbox v-model="notifyCrew" description="Send broadcast when mission changes">
            Notify crew
          </UiCheckbox>
        </UiStack>
      </template>
    </UiFormField>

    <UiFormField label="Crew position">
      <template #default>
        <UiRadioGroup v-model="role" :options="roleOptions" />
      </template>
    </UiFormField>

    <UiFormField label="Mission visibility">
      <template #default>
        <UiSegmentedControl v-model="visibility" :options="visibilityOptions" />
      </template>
    </UiFormField>

    <UiFormField label="Allow comments" hide-label>
      <template #default>
        <UiSwitch v-model="allowComments">Allow comments</UiSwitch>
      </template>
    </UiFormField>
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  UiCheckbox,
  UiFormField,
  UiRadioGroup,
  UiSegmentedControl,
  UiStack,
  UiSwitch,
} from '~/components/ui';

const mayInvite = ref(true);
const notifyCrew = ref(false);
const role = ref('captain');
const visibility = ref('crew');
const allowComments = ref(true);

const roleOptions = [
  { label: 'Captain', value: 'captain' },
  { label: 'Navigator', value: 'navigator' },
  { label: 'Science officer', value: 'science' },
];

const visibilityOptions = [
  { label: 'Crew', value: 'crew' },
  { label: 'Public', value: 'public' },
];
</script>
