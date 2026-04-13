<template>
  <UiStack :gap="'var(--space-lg)'">
    <UiFormField label="Call sign" :required="true" description="Used as slug on crew profile.">
      <template #default="{ id, describedBy }">
        <UiTextInput
          v-model="callSign"
          :id="id"
          :described-by="describedBy"
          placeholder="Nova"
        />
      </template>
    </UiFormField>

    <UiFormField label="Password" hint="Must be at least 8 characters.">
      <template #default="{ id, describedBy }">
        <UiPasswordInput v-model="password" :id="id" :described-by="describedBy" />
      </template>
    </UiFormField>

    <UiFormField label="Mission summary">
      <template #default="{ id, describedBy }">
        <UiTextArea
          v-model="summary"
          :id="id"
          :described-by="describedBy"
          rows="3"
        />
      </template>
    </UiFormField>

    <UiFormField label="Crew capacity" description="Number of available seats.">
      <template #default="{ id, describedBy }">
        <UiNumberInput
          v-model="capacity"
          :id="id"
          :described-by="describedBy"
          min="0"
        />
      </template>
    </UiFormField>

    <UiFormField label="Flight plan" description="Select an existing plan.">
      <template #default="{ id, describedBy }">
        <UiSelect
          :id="id"
          :described-by="describedBy"
          v-model="flightPlan"
          :options="flightPlanOptions"
          placeholder="Choose plan"
        />
      </template>
    </UiFormField>

    <UiFormField label="Crew search">
      <template #default="{ id }">
        <UiCombobox
          :id="id"
          :items="crewItems"
          v-model="selectedCrew"
          :placeholder="'Search crew…'"
        />
      </template>
    </UiFormField>
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  UiCombobox,
  UiFormField,
  UiNumberInput,
  UiPasswordInput,
  UiSelect,
  UiTextArea,
  UiTextInput,
  UiStack,
} from '~/components/ui';

const callSign = ref('Nova');
const password = ref('password');
const summary = ref('Coordinate maintenance crews ahead of the midnight window.');
const capacity = ref('4');
const flightPlan = ref('maintenance');
const selectedCrew = ref('');

const flightPlanOptions = [
  { label: 'Midnight maintenance window', value: 'maintenance' },
  { label: 'Outer marker scouting', value: 'scouting' },
];

const crewItems = [
  { label: 'Nova', value: 'nova' },
  { label: 'Vector', value: 'vector' },
  { label: 'Sparrow', value: 'sparrow' },
];
</script>
