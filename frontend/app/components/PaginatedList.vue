<template>
  <component :is="containerTag" :class="containerClass">
    <slot name="header" />

    <p v-if="errorMessage" class="loading-copy">{{ errorMessage }}</p>

    <component :is="listTag" :class="listClass">
      <component :is="rowTag" v-if="pending && isEmpty" :class="loadingRowClasses">
        <slot name="loading">{{ loadingLabel }}</slot>
      </component>
      <component :is="rowTag" v-else-if="isEmpty" :class="emptyRowClasses">
        <slot name="empty">{{ emptyLabel }}</slot>
      </component>
      <component
        v-else
        :is="rowTag"
        v-for="(item,index) in items"
        :key="keyFor(item, index)"
        :class="rowClassesFor(item)"
      >
        <slot :item="item" :index="index" />
      </component>
      <component v-if="pending && !isEmpty" :is="rowTag" :class="loadingRowClasses">
        <slot name="loading">{{ loadingLabel }}</slot>
      </component>
    </component>

    <UiButton
      v-if="showMore"
      variant="secondary"
      size="sm"
      class="paginated-list__more"
      type="button"
      @click="emit('load-more')"
    >
      <slot name="more-label">Show more…</slot>
    </UiButton>
  </component>
</template>

<script setup lang="ts" generic="T">
import { computed } from 'vue';
import { UiButton } from '~/components/ui';

type RowClassProp<TItem> = string | string[] | false | null | undefined | ((item: TItem) => string | string[] | false | null | undefined);
type ItemKeyProp<TItem> = (item: TItem, index: number) => string | number;

const props = withDefaults(
  defineProps<{
    items: T[];
    containerTag?: string;
    containerClass?: string | string[];
    listTag?: string;
    listClass?: string | string[];
    rowTag?: string;
    pending?: boolean;
    errorMessage?: string;
    emptyLabel?: string;
    loadingLabel?: string;
    showMore?: boolean;
    rowBaseClass?: string | string[];
    rowClass?: RowClassProp<T>;
    loadingRowClass?: string | string[];
    emptyRowClass?: string | string[];
    itemKey?: ItemKeyProp<T>;
  }>(),
  {
    containerTag: 'div',
    containerClass: 'paginated-list',
    listTag: 'ul',
    listClass: 'logbook-list',
    rowTag: 'li',
    pending: false,
    errorMessage: '',
    emptyLabel: 'No entries available yet.',
    loadingLabel: 'Loading…',
    showMore: false,
    rowBaseClass: 'logbook-entry',
    rowClass: undefined,
    loadingRowClass: 'logbook-entry--loading',
    emptyRowClass: 'logbook-entry--empty',
    itemKey: undefined,
  },
);

type PaginatedListSlots<TItem> = {
  header?: () => unknown;
  loading?: () => unknown;
  empty?: () => unknown;
  default: (slotProps: { item: TItem; index: number }) => unknown;
  'more-label'?: () => unknown;
};

defineSlots<PaginatedListSlots<T>>();

const emit = defineEmits<{
  'load-more': [];
}>();

const isEmpty = computed(() => !props.items.length);

const defaultKey = ((item: T, index: number) => {
  if (item && typeof item === 'object' && 'id' in item) {
    const identifier = (item as Record<string, unknown>).id;
    if (typeof identifier === 'string' || typeof identifier === 'number') {
      return identifier;
    }
  }
  return index;
}) as ItemKeyProp<T>;

const keyFor = (item: T, index: number) => {
  const getter = props.itemKey ?? defaultKey;
  return getter(item, index);
};

const normaliseClass = (value: string | string[] | false | null | undefined) => {
  if (!value) return [] as string[];
  return Array.isArray(value) ? value.filter(Boolean) : String(value).split(/\s+/).filter(Boolean);
};

const baseRowClasses = computed(() => normaliseClass(props.rowBaseClass));

const withBaseClasses = (additional?: string | string[] | false | null | undefined) => {
  return [...baseRowClasses.value, ...normaliseClass(additional)];
};

const loadingRowClasses = computed(() => withBaseClasses(props.loadingRowClass));
const emptyRowClasses = computed(() => withBaseClasses(props.emptyRowClass));

const rowClassesFor = (item: T) => {
  const { rowClass } = props;
  const extra = rowClass ? (typeof rowClass === 'function' ? rowClass(item) : rowClass) : undefined;
  return withBaseClasses(extra);
};
</script>

<style scoped>
.logbook-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.logbook-entry--loading,
.logbook-entry--empty {
  padding: var(--space-lg);
  border-radius: var(--layout-card-radius);
  background: var(--color-surface-panel);
  border: var(--size-base-layout-px) dashed var(--color-border-weak);
  color: var(--color-text-secondary);
  font-style: italic;
}

.paginated-list__more {
  align-self: flex-start;
}
</style>
