<template>
  <UiSurface class="flight-plan-lifecycle" variant="panel">
    <UiStack :gap="'var(--space-md)'">
      <div>
        <UiText variant="eyebrow">Mission lifecycle</UiText>
        <UiInline :gap="'var(--space-xs)'" class="flight-plan-lifecycle__badges">
          <UiTag size="sm">{{ statusLabel }}</UiTag>
          <UiTag size="sm" variant="muted">{{ bucketLabel }}</UiTag>
        </UiInline>
        <UiText v-if="plan.statusChangedAt" variant="muted" class="flight-plan-lifecycle__meta">
          Last status update: {{ plan.statusChangedAt }}
        </UiText>
        <UiText v-if="plan.statusReason" variant="muted" class="flight-plan-lifecycle__meta">
          Reason: {{ plan.statusReason }}
        </UiText>
      </div>

      <UiAlert v-if="localError" variant="danger" layout="inline">
        {{ localError }}
      </UiAlert>

      <template v-if="canManage">
        <UiStack :gap="'var(--space-sm)'">
          <UiHeading :level="3" size="h5" :uppercase="false">Transition status</UiHeading>
          <UiFormField label="Next status">
            <template #default="{ id, describedBy }">
              <UiSelect
                :id="id"
                :described-by="describedBy"
                v-model="selectedStatus"
                :options="transitionOptions"
                :disabled="busy || !transitionOptions.length"
              />
            </template>
          </UiFormField>
          <UiFormField label="Status reason">
            <template #default="{ id, describedBy }">
              <UiTextArea
                :id="id"
                :described-by="describedBy"
                v-model="transitionReason"
                :rows="3"
                :disabled="busy"
                placeholder="Add reason when status requires context (on-hold, postponed, failure, aborted, cancelled)."
              />
            </template>
          </UiFormField>
          <UiInline :gap="'var(--space-sm)'">
            <UiButton
              type="button"
              :loading="busy"
              :disabled="busy || !selectedStatus"
              @click="submitTransition"
            >
              Update status
            </UiButton>
          </UiInline>
        </UiStack>

        <UiText v-if="!isTerminal" variant="muted">
          Create next iteration unlocks after a terminal status (Success, Failure, Aborted, or
          Cancelled).
        </UiText>

        <UiStack v-if="canReopen" :gap="'var(--space-sm)'">
          <UiHeading :level="3" size="h5" :uppercase="false">Reopen mission</UiHeading>
          <UiFormField label="Reopen reason">
            <template #default="{ id, describedBy }">
              <UiTextArea
                :id="id"
                :described-by="describedBy"
                v-model="reopenReason"
                :rows="3"
                :disabled="busy"
                placeholder="Required: explain why this mission should return to pending."
              />
            </template>
          </UiFormField>
          <UiInline :gap="'var(--space-sm)'">
            <UiButton
              type="button"
              variant="secondary"
              :loading="busy"
              :disabled="busy"
              @click="submitReopen"
            >
              Reopen to pending
            </UiButton>
          </UiInline>
        </UiStack>

        <UiStack v-if="isTerminal" :gap="'var(--space-sm)'">
          <UiHeading :level="3" size="h5" :uppercase="false">Create next iteration</UiHeading>
          <UiFormField label="Next mission title">
            <template #default="{ id, describedBy }">
              <UiTextInput
                :id="id"
                :described-by="describedBy"
                v-model="iterationTitle"
                :disabled="busy"
                placeholder="Optional. Defaults to current title + iteration number."
              />
            </template>
          </UiFormField>
          <UiFormField v-if="requiresEventDate" label="Event date">
            <template #default="{ id, describedBy }">
              <UiTextInput
                :id="id"
                :described-by="describedBy"
                v-model="iterationEventDate"
                :disabled="busy"
                type="date"
              />
            </template>
          </UiFormField>
          <UiInline :gap="'var(--space-sm)'">
            <UiButton
              type="button"
              variant="secondary"
              :loading="busy"
              :disabled="busy"
              @click="submitCreateIteration"
            >
              Create next iteration
            </UiButton>
          </UiInline>
        </UiStack>
      </template>

      <UiText v-else variant="muted">
        Only the captain or sailing-master+ can manage mission lifecycle transitions.
      </UiText>
    </UiStack>
  </UiSurface>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  getAllowedFlightPlanLifecycleTransitions,
  isFlightPlanLifecycleReopenableStatus,
  isFlightPlanLifecycleTerminalStatus,
  shouldRequireReasonForFlightPlanTransition,
  validateFlightPlanStatusReason,
  type FlightPlanLifecycleStatus,
} from '@astralpirates/shared/flightPlanLifecycle';
import type { FlightPlanSummary } from '~/modules/api/schemas';
import {
  getFlightPlanBucketLabel,
  getFlightPlanStatusLabel,
  resolveFlightPlanLifecycleStatus,
  FLIGHT_PLAN_STATUS_LABELS,
} from '~/domains/flightPlans/lifecycle';
import {
  UiAlert,
  UiButton,
  UiFormField,
  UiHeading,
  UiInline,
  UiSelect,
  UiStack,
  UiSurface,
  UiTag,
  UiText,
  UiTextArea,
  UiTextInput,
} from '~/components/ui';

const props = withDefaults(
  defineProps<{
    plan: FlightPlanSummary;
    canManage: boolean;
    busy?: boolean;
  }>(),
  {
    busy: false,
  },
);

const emit = defineEmits<{
  transition: [payload: { status: FlightPlanLifecycleStatus; statusReason: string | null }];
  reopen: [payload: { statusReason: string }];
  createIteration: [payload: { title?: string; eventDate?: string }];
}>();

const selectedStatus = ref('');
const transitionReason = ref('');
const reopenReason = ref('');
const iterationTitle = ref('');
const iterationEventDate = ref('');
const localError = ref('');

const currentStatus = computed<FlightPlanLifecycleStatus>(() =>
  resolveFlightPlanLifecycleStatus(props.plan.status),
);

const statusLabel = computed(() => getFlightPlanStatusLabel(currentStatus.value));
const bucketLabel = computed(() => getFlightPlanBucketLabel(currentStatus.value));

const transitionOptions = computed(() =>
  getAllowedFlightPlanLifecycleTransitions(currentStatus.value).map((status) => ({
    label: FLIGHT_PLAN_STATUS_LABELS[status],
    value: status,
  })),
);

const canReopen = computed(() => isFlightPlanLifecycleReopenableStatus(currentStatus.value));
const isTerminal = computed(() => isFlightPlanLifecycleTerminalStatus(currentStatus.value));
const requiresEventDate = computed(() => props.plan.category === 'event');

watch(
  () => [props.plan.id, props.plan.status],
  () => {
    selectedStatus.value = '';
    transitionReason.value = '';
    reopenReason.value = '';
    iterationTitle.value = '';
    iterationEventDate.value = '';
    localError.value = '';
  },
  { immediate: true },
);

const submitTransition = () => {
  localError.value = '';
  const toStatus = selectedStatus.value as FlightPlanLifecycleStatus;
  if (!toStatus) {
    localError.value = 'Choose a target status first.';
    return;
  }

  const reasonValidation = validateFlightPlanStatusReason({
    reason: transitionReason.value,
    required: shouldRequireReasonForFlightPlanTransition({
      action: 'transition',
      targetStatus: toStatus,
    }),
  });

  if (!reasonValidation.ok) {
    localError.value = reasonValidation.error;
    return;
  }

  emit('transition', {
    status: toStatus,
    statusReason: reasonValidation.reason,
  });
};

const submitReopen = () => {
  localError.value = '';
  const reasonValidation = validateFlightPlanStatusReason({
    reason: reopenReason.value,
    required: true,
  });

  if (!reasonValidation.ok || !reasonValidation.reason) {
    localError.value = reasonValidation.ok ? 'statusReason is required.' : reasonValidation.error;
    return;
  }

  emit('reopen', {
    statusReason: reasonValidation.reason,
  });
};

const submitCreateIteration = () => {
  localError.value = '';
  const title = iterationTitle.value.trim();
  const eventDate = iterationEventDate.value.trim();

  if (requiresEventDate.value && !eventDate) {
    localError.value = 'Event iterations require a new eventDate.';
    return;
  }

  emit('createIteration', {
    title: title.length > 0 ? title : undefined,
    eventDate: eventDate.length > 0 ? eventDate : undefined,
  });
};
</script>

<style scoped>
.flight-plan-lifecycle {
  width: 100%;
}

.flight-plan-lifecycle__badges {
  margin-top: var(--space-xs);
}

.flight-plan-lifecycle__meta {
  margin-top: var(--space-2xs);
}
</style>
