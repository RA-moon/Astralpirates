<template>
  <UiDrawer
    class="page-editor"
    :model-value="drawerOpen"
    aria-labelledby="page-editor-title"
    side="right"
    close-on-backdrop
    @update:model-value="handleDrawerToggle"
  >
    <div class="page-editor__panel">
        <header class="page-editor__header">
          <div>
            <h2 id="page-editor-title" class="page-editor__title">Edit page</h2>
            <p v-if="draft" class="page-editor__subtitle">{{ draft.title }}</p>
            <p v-if="draft" class="page-editor__path">Path: {{ draft.path }}</p>
          </div>
          <UiIconButton
            class="page-editor__close"
            variant="ghost"
            size="sm"
            aria-label="Close editor"
            @click="requestClose"
          >
            ×
          </UiIconButton>
        </header>

        <main class="page-editor__content" v-if="draft">
          <section class="page-editor__section">
            <h3 class="page-editor__section-title">Page details</h3>
            <PageEditorInput v-model="pageTitle" label="Title" />
            <PageEditorInput
              v-model="pageSummary"
              label="Summary"
              kind="textarea"
              :rows="3"
              placeholder="Optional short summary"
            />
            <details class="page-editor__details" :open="navigationEnabled">
              <summary class="page-editor__details-summary">Navigation overrides</summary>
              <PageEditorInput v-model="navigationNodeId" label="Node ID" />
              <PageEditorInput v-model="navigationLabel" label="Label override" />
              <PageEditorInput
                v-model="navigationDescription"
                label="Description override"
                kind="textarea"
                :rows="3"
              />
              <div class="page-editor__actions page-editor__actions--inline">
                <UiButton type="button" variant="secondary" size="sm" @click="clearNavigation">
                  Clear overrides
                </UiButton>
              </div>
            </details>
          </section>

          <section class="page-editor__section">
            <h3 class="page-editor__section-title">Sections</h3>
            <p v-if="!layout.length" class="page-editor__empty">No sections yet.</p>

            <div
              v-for="(block, index) in layout"
              :key="blockKey(block, index)"
              class="page-editor-block"
            >
              <header class="page-editor-block__header">
                <div>
                  <span class="page-editor-block__badge">{{ formatBlockLabel(block.blockType) }}</span>
                  <strong class="page-editor-block__heading">
                    {{ resolveBlockHeading(block, index) }}
                  </strong>
                </div>
                <div class="page-editor-block__controls">
                  <UiIconButton
                    type="button"
                    class="page-editor-block__control"
                    :disabled="index === 0"
                    title="Move up"
                    aria-label="Move block up"
                    @click="moveBlock(index, -1)"
                   variant="ghost" size="sm">
                    ↑
                  </UiIconButton>
                  <UiIconButton
                    type="button"
                    class="page-editor-block__control"
                    :disabled="index === layout.length - 1"
                    title="Move down"
                    aria-label="Move block down"
                    @click="moveBlock(index, 1)"
                   variant="ghost" size="sm">
                    ↓
                  </UiIconButton>
                  <UiIconButton
                    type="button"
                    class="page-editor-block__control"
                    title="Duplicate block"
                    aria-label="Duplicate block"
                    @click="duplicateBlock(index)"
                   variant="ghost" size="sm">
                    ⧉
                  </UiIconButton>
                  <UiIconButton
                    type="button"
                    class="page-editor-block__control page-editor-block__control--danger"
                    title="Remove block"
                    aria-label="Remove block"
                    @click="removeBlock(index)"
                   variant="ghost" size="sm">
                    ✕
                  </UiIconButton>
                </div>
              </header>

              <div class="page-editor-block__body">
                <template v-if="block.blockType === 'hero'">
                  <PageEditorInput v-model="asHero(block).eyebrow" label="Eyebrow" />
                  <PageEditorInput v-model="asHero(block).title" label="Title" />
                  <EditableRichTextField
                    v-model="asHero(block).tagline"
                    label="Tagline"
                    :rows="3"
                  />
                  <EditableRichTextField v-model="asHero(block).body" label="Body" :rows="5" />
                  <div class="page-editor__subsection">
                    <header class="page-editor__subsection-header">
                      <h4>Calls to action</h4>
                      <UiButton type="button" variant="secondary" size="sm" @click="addHeroCta(asHero(block))">
                        Add CTA
                      </UiButton>
                    </header>
                    <div
                      v-for="(cta, ctaIndex) in heroCtas(asHero(block))"
                      :key="`hero-cta-${ctaIndex}`"
                      class="page-editor__subsection-item"
                    >
                      <LinkEditorRow v-model="heroCtas(asHero(block))[ctaIndex]!" />
                      <UiButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        @click="removeHeroCta(asHero(block), ctaIndex)"
                      >
                        Remove CTA
                      </UiButton>
                    </div>
                  </div>
                </template>

                <template v-else-if="block.blockType === 'cardGrid'">
                  <PageEditorInput v-model="asCardGrid(block).title" label="Title" />
                  <EditableRichTextField
                    v-model="asCardGrid(block).intro"
                    label="Introduction"
                    :rows="4"
                  />
                  <PageEditorInput
                    v-model="asCardGrid(block).columns"
                    label="Columns"
                    kind="select"
                    :options="cardGridColumnOptions"
                  />
                  <div class="page-editor__subsection">
                    <header class="page-editor__subsection-header">
                      <h4>Cards</h4>
                      <UiButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        @click="addCard(asCardGrid(block))"
                      >
                        Add card
                      </UiButton>
                    </header>
                    <div
                      v-for="(card, cardIndex) in asCardGrid(block).cards"
                      :key="`card-${cardIndex}`"
                      class="page-editor__card"
                    >
                      <header class="page-editor__card-header">
                        <strong>Card {{ cardIndex + 1 }}</strong>
                        <div class="page-editor__card-controls">
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control"
                            :disabled="cardIndex === 0"
                            @click="moveCard(asCardGrid(block), cardIndex, -1)"
                            title="Move up"
                            aria-label="Move card up"
                           variant="ghost" size="sm">
                            ↑
                          </UiIconButton>
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control"
                            :disabled="cardIndex === asCardGrid(block).cards.length - 1"
                            @click="moveCard(asCardGrid(block), cardIndex, 1)"
                            title="Move down"
                            aria-label="Move card down"
                           variant="ghost" size="sm">
                            ↓
                          </UiIconButton>
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control page-editor-block__control--danger"
                            @click="removeCard(asCardGrid(block), cardIndex)"
                            title="Remove card"
                            aria-label="Remove card"
                           variant="ghost" size="sm">
                            ✕
                          </UiIconButton>
                        </div>
                      </header>
                      <PageEditorInput
                        v-model="card.variant"
                        label="Variant"
                        kind="select"
                        :options="cardVariantOptions"
                      />
                      <PageEditorInput v-model="card.badge" label="Badge" />
                      <PageEditorInput v-model="card.title" label="Title" />
                      <EditableRichTextField v-model="card.body" label="Body" :rows="4" />
                      <div class="page-editor__subsection">
                        <header class="page-editor__subsection-header">
                          <h5>Links</h5>
                          <UiButton
                            type="button"
                            variant="secondary" size="sm"
                            @click="addCardCta(card)"
                          >
                            Add link
                          </UiButton>
                        </header>
                        <div
                          v-for="(cta, ctaIndex) in cardCtas(card)"
                          :key="`card-cta-${ctaIndex}`"
                          class="page-editor__subsection-item"
                        >
                          <LinkEditorRow v-model="cardCtas(card)[ctaIndex]!" />
                          <UiButton
                            type="button"
                            variant="secondary" size="sm"
                            @click="removeCardCta(card, ctaIndex)"
                          >
                            Remove link
                          </UiButton>
                        </div>
                      </div>
                      <div class="page-editor__subsection">
                        <header class="page-editor__subsection-header">
                          <h5>Dynamic config</h5>
                        </header>
                        <div class="page-editor__field-grid">
                          <PageEditorInput
                            v-model.number="cardConfig(card).limit"
                            label="Limit"
                            kind="number"
                            :min="1"
                            :max="12"
                            step="1"
                          />
                          <PageEditorInput
                            v-model="cardConfig(card).minRole"
                            label="Minimum role"
                            kind="select"
                            :options="crewRoleOptionsWithAny"
                          />
                        </div>
                        <PageEditorInput v-model="cardConfig(card).emptyLabel" label="Empty state label" />
                      </div>
                    </div>
                  </div>
                </template>

                <template v-else-if="block.blockType === 'ctaList'">
                  <PageEditorInput v-model="asCtaList(block).title" label="Title" />
                  <EditableRichTextField
                    v-model="asCtaList(block).intro"
                    label="Introduction"
                    :rows="4"
                  />
                  <div class="page-editor__subsection">
                    <header class="page-editor__subsection-header">
                      <h4>Items</h4>
                      <UiButton
                        type="button"
                        variant="secondary" size="sm"
                        @click="addCtaListItem(asCtaList(block))"
                      >
                        Add item
                      </UiButton>
                    </header>
                    <div
                      v-for="(item, itemIndex) in asCtaList(block).items"
                      :key="`cta-item-${itemIndex}`"
                      class="page-editor__card"
                    >
                      <header class="page-editor__card-header">
                        <strong>Item {{ itemIndex + 1 }}</strong>
                        <div class="page-editor__card-controls">
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control"
                            :disabled="itemIndex === 0"
                            @click="moveCtaListItem(asCtaList(block), itemIndex, -1)"
                            title="Move up"
                            aria-label="Move item up"
                           variant="ghost" size="sm">
                            ↑
                          </UiIconButton>
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control"
                            :disabled="itemIndex === asCtaList(block).items.length - 1"
                            @click="moveCtaListItem(asCtaList(block), itemIndex, 1)"
                            title="Move down"
                            aria-label="Move item down"
                           variant="ghost" size="sm">
                            ↓
                          </UiIconButton>
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control page-editor-block__control--danger"
                            @click="removeCtaListItem(asCtaList(block), itemIndex)"
                            title="Remove item"
                            aria-label="Remove item"
                           variant="ghost" size="sm">
                            ✕
                          </UiIconButton>
                        </div>
                      </header>
                      <PageEditorInput v-model="item.title" label="Title" />
                      <EditableRichTextField
                        v-model="item.description"
                        label="Description"
                        :rows="4"
                      />
                      <div class="page-editor__subsection">
                        <header class="page-editor__subsection-header">
                          <h5>Link</h5>
                        </header>
                        <LinkEditorRow
                          v-if="item.cta"
                          v-model="item.cta"
                          :allow-style="false"
                        />
                        <div v-else class="page-editor__actions page-editor__actions--inline">
                          <UiButton
                            type="button"
                            variant="secondary" size="sm"
                            @click="addCtaListLink(item)"
                          >
                            Add link
                          </UiButton>
                        </div>
                        <div v-if="item.cta" class="page-editor__actions page-editor__actions--inline">
                          <UiButton
                            type="button"
                            variant="secondary" size="sm"
                            @click="removeCtaListLink(item)"
                          >
                            Remove link
                          </UiButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>

                <template v-else-if="block.blockType === 'timeline'">
                  <PageEditorInput v-model="asTimeline(block).title" label="Title" />
                  <EditableRichTextField
                    v-model="asTimeline(block).intro"
                    label="Introduction"
                    :rows="4"
                  />
                  <div class="page-editor__subsection">
                    <header class="page-editor__subsection-header">
                      <h4>Timeline entries</h4>
                      <UiButton
                        type="button"
                        variant="secondary" size="sm"
                        @click="addTimelineItem(asTimeline(block))"
                      >
                        Add entry
                      </UiButton>
                    </header>
                    <div
                      v-for="(item, itemIndex) in asTimeline(block).items"
                      :key="`timeline-item-${itemIndex}`"
                      class="page-editor__card"
                    >
                      <header class="page-editor__card-header">
                        <strong>Entry {{ itemIndex + 1 }}</strong>
                        <div class="page-editor__card-controls">
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control"
                            :disabled="itemIndex === 0"
                            @click="moveTimelineItem(asTimeline(block), itemIndex, -1)"
                            title="Move up"
                            aria-label="Move item up"
                           variant="ghost" size="sm">
                            ↑
                          </UiIconButton>
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control"
                            :disabled="itemIndex === asTimeline(block).items.length - 1"
                            @click="moveTimelineItem(asTimeline(block), itemIndex, 1)"
                            title="Move down"
                            aria-label="Move item down"
                           variant="ghost" size="sm">
                            ↓
                          </UiIconButton>
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control page-editor-block__control--danger"
                            @click="removeTimelineItem(asTimeline(block), itemIndex)"
                            title="Remove entry"
                            aria-label="Remove entry"
                           variant="ghost" size="sm">
                            ✕
                          </UiIconButton>
                        </div>
                      </header>
                      <PageEditorInput v-model="item.heading" label="Heading" />
                      <PageEditorInput v-model="item.timestamp" label="Timestamp" />
                      <EditableRichTextField v-model="item.body" label="Body" :rows="5" />
                    </div>
                  </div>
                </template>

                <template v-else-if="block.blockType === 'imageCarousel'">
                  <PageEditorInput v-model="asImageCarousel(block).title" label="Title" />
                  <EditableRichTextField
                    v-model="asImageCarousel(block).intro"
                    label="Introduction"
                    :rows="3"
                  />
                  <div class="page-editor__subsection">
                    <header class="page-editor__subsection-header">
                      <h4>Slides</h4>
                      <div class="page-editor__actions page-editor__actions--inline">
                        <UiButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          data-testid="page-carousel-upload-button"
                          :disabled="
                            !canUploadPageCarouselImages ||
                            isCarouselBlockUploading(index) ||
                            carouselRemainingSlots(asImageCarousel(block)) === 0
                          "
                          @click="triggerCarouselBlockUpload(index)"
                        >
                          <span v-if="isCarouselBlockUploading(index)">Uploading…</span>
                          <span v-else>Upload media</span>
                        </UiButton>
                        <UiButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          @click="addCarouselSlide(asImageCarousel(block))"
                        >
                          Add URL slide
                        </UiButton>
                      </div>
                    </header>
                    <p v-if="!canUploadPageCarouselImages" class="page-editor__hint">
                      Save this page first to upload media.
                    </p>
                    <p
                      v-else-if="carouselRemainingSlots(asImageCarousel(block)) === 0"
                      class="page-editor__hint"
                    >
                      Carousel is full. Remove a slide to upload another file.
                    </p>
                    <p v-else class="page-editor__hint">
                      Upload images, videos, audio, and 3D models up to
                      {{ GALLERY_UPLOAD_MAX_FILE_SIZE_LABEL }}.
                    </p>
                    <p
                      v-if="carouselBlockUploadError(index)"
                      class="page-editor__error page-editor__error--inline"
                    >
                      {{ carouselBlockUploadError(index) }}
                    </p>
                    <div
                      v-for="(slide, slideIndex) in asImageCarousel(block).slides"
                      :key="`carousel-slide-${slideIndex}`"
                      class="page-editor__card page-editor__carousel-slide"
                    >
                      <GallerySlideAccordionItem
                        :accordion-id="carouselSlideAccordionId(index, slideIndex)"
                        :title="carouselSlideAccordionTitle(slide, slideIndex)"
                        :preview-url="resolveCarouselSlidePreviewUrl(slide) ?? null"
                        :preview-alt="slide.imageAlt?.trim() || slide.label?.trim() || `Slide ${slideIndex + 1}`"
                        :media-type="normalizeGalleryMediaType(slide.mediaType) ?? 'image'"
                        :preview-broken="isCarouselSlidePreviewBroken(index, slideIndex)"
                        :move-up-disabled="slideIndex === 0"
                        :move-down-disabled="slideIndex === asImageCarousel(block).slides.length - 1"
                        @preview-error="markCarouselSlidePreviewBroken(index, slideIndex)"
                        @move-up="moveCarouselSlide(asImageCarousel(block), slideIndex, -1)"
                        @move-down="moveCarouselSlide(asImageCarousel(block), slideIndex, 1)"
                        @remove="removeCarouselSlide(asImageCarousel(block), index, slideIndex)"
                      >
                        <template #fields>
                          <PageEditorInput
                            :model-value="resolveCarouselSlideType(slide)"
                            label="Media source"
                            kind="select"
                            :options="carouselImageTypeOptions"
                            @update:model-value="(value) => setCarouselSlideImageType(slide, value)"
                          />
                          <div
                            v-if="resolveCarouselSlideType(slide) === 'upload'"
                            class="page-editor__upload"
                          >
                            <p class="page-editor__hint">
                              This slide uses an uploaded file. Use the uploader above to add media.
                              Remove this slide and upload again to replace the file.
                            </p>
                          </div>
                          <PageEditorInput
                            v-else
                            v-model="slide.imageUrl"
                            label="Media URL"
                            placeholder="https://cdn.example.com/asset"
                          />
                          <PageEditorInput
                            v-model="slide.imageAlt"
                            label="Alt text"
                            placeholder="Describe the media for accessibility."
                          />
                          <details class="page-editor__details">
                            <summary class="page-editor__details-summary">Advanced options</summary>
                            <PageEditorInput
                              :model-value="slide.mediaType ?? 'image'"
                              label="Media type"
                              kind="select"
                              :options="carouselMediaTypeOptions"
                              @update:model-value="(value) => setCarouselSlideMediaType(slide, value)"
                            />
                            <PageEditorInput v-model="slide.label" label="Label" />
                            <PageEditorInput
                              v-model="slide.caption"
                              label="Caption"
                              kind="textarea"
                              :rows="2"
                              placeholder="Optional supporting copy"
                            />
                            <div class="page-editor__field-grid">
                              <PageEditorInput
                                v-model="slide.creditLabel"
                                label="Credit label"
                                placeholder="Photo by…"
                              />
                              <PageEditorInput
                                v-model="slide.creditUrl"
                                label="Credit URL"
                                placeholder="https://"
                              />
                            </div>
                          </details>
                        </template>
                      </GallerySlideAccordionItem>
                    </div>
                  </div>
                </template>

                <template v-else-if="block.blockType === 'statGrid'">
                  <PageEditorInput v-model="asStatGrid(block).title" label="Title" />
                  <EditableRichTextField
                    v-model="asStatGrid(block).intro"
                    label="Introduction"
                    :rows="3"
                  />
                  <div class="page-editor__subsection">
                    <header class="page-editor__subsection-header">
                      <h4>Stats</h4>
                      <UiButton
                        type="button"
                        variant="secondary" size="sm"
                        @click="addStat(asStatGrid(block))"
                      >
                        Add stat
                      </UiButton>
                    </header>
                    <div
                      v-for="(stat, statIndex) in asStatGrid(block).stats"
                      :key="`stat-${statIndex}`"
                      class="page-editor__card"
                    >
                      <header class="page-editor__card-header">
                        <strong>Stat {{ statIndex + 1 }}</strong>
                        <div class="page-editor__card-controls">
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control"
                            :disabled="statIndex === 0"
                            @click="moveStat(asStatGrid(block), statIndex, -1)"
                            title="Move up"
                            aria-label="Move stat up"
                           variant="ghost" size="sm">
                            ↑
                          </UiIconButton>
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control"
                            :disabled="statIndex === asStatGrid(block).stats.length - 1"
                            @click="moveStat(asStatGrid(block), statIndex, 1)"
                            title="Move down"
                            aria-label="Move stat down"
                           variant="ghost" size="sm">
                            ↓
                          </UiIconButton>
                          <UiIconButton
                            type="button"
                            class="page-editor-block__control page-editor-block__control--danger"
                            @click="removeStat(asStatGrid(block), statIndex)"
                            title="Remove stat"
                            aria-label="Remove stat"
                           variant="ghost" size="sm">
                            ✕
                          </UiIconButton>
                        </div>
                      </header>
                      <div class="page-editor__field-grid">
                        <PageEditorInput v-model="stat.value" label="Value" />
                        <PageEditorInput v-model="stat.label" label="Label" />
                      </div>
                    </div>
                  </div>
                  <div class="page-editor__subsection">
                    <header class="page-editor__subsection-header">
                      <h4>Links</h4>
                      <UiButton
                        type="button"
                        variant="secondary" size="sm"
                        @click="addStatCta(asStatGrid(block))"
                      >
                        Add link
                      </UiButton>
                    </header>
                    <div
                      v-for="(cta, ctaIndex) in statCtas(asStatGrid(block))"
                      :key="`stat-cta-${ctaIndex}`"
                      class="page-editor__subsection-item"
                    >
                      <LinkEditorRow v-model="statCtas(asStatGrid(block))[ctaIndex]!" />
                      <UiButton
                        type="button"
                        variant="secondary" size="sm"
                        @click="removeStatCta(asStatGrid(block), ctaIndex)"
                      >
                        Remove link
                      </UiButton>
                    </div>
                  </div>
                </template>

                <template v-else-if="block.blockType === 'crewPreview'">
                  <PageEditorInput v-model="asCrewPreview(block).title" label="Title" />
                  <EditableRichTextField
                    v-model="asCrewPreview(block).description"
                    label="Description"
                    :rows="4"
                  />
                  <div class="page-editor__field-grid">
                    <PageEditorInput
                      v-model="asCrewPreview(block).minRole"
                      label="Minimum role"
                      kind="select"
                      :options="crewRoleOptionsWithAny"
                    />
                    <PageEditorInput
                      v-model.number="asCrewPreview(block).limit"
                      label="Limit"
                      kind="number"
                      :min="1"
                      :max="12"
                      step="1"
                    />
                  </div>
                  <div class="page-editor__subsection">
                    <header class="page-editor__subsection-header">
                      <h4>Primary link</h4>
                    </header>
                    <LinkEditorRow
                      v-if="asCrewPreview(block).cta"
                      v-model="asCrewPreview(block).cta!"
                    />
                    <div
                      v-if="asCrewPreview(block).cta"
                      class="page-editor__actions page-editor__actions--inline"
                    >
                      <UiButton
                        type="button"
                        variant="secondary" size="sm"
                        @click="removeCrewPreviewCta(asCrewPreview(block))"
                      >
                        Remove link
                      </UiButton>
                    </div>
                    <div
                      v-else
                      class="page-editor__actions page-editor__actions--inline"
                    >
                      <UiButton
                        type="button"
                        variant="secondary" size="sm"
                        @click="addCrewPreviewCta(asCrewPreview(block))"
                      >
                        Add link
                      </UiButton>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div class="page-editor__add-block">
              <div class="page-editor__add-controls">
                <PageEditorInput
                  v-model="newBlockType"
                  label="Add section"
                  kind="select"
                  :options="blockOptions"
                />
                <UiButton type="button" @click="addBlock">Add</UiButton>
              </div>
            </div>
          </section>
        </main>

        <footer class="page-editor__footer">
          <p
            v-if="pageLockNotice"
            :class="[
              'page-editor__lock-notice',
              { 'page-editor__lock-notice--error': pageLockNoticeIsError },
            ]"
            role="status"
          >
            {{ pageLockNotice }}
          </p>
          <div v-if="pageLockTakeoverVisible" class="page-editor__actions page-editor__actions--inline">
            <UiButton
              type="button"
              variant="secondary"
              size="sm"
              :loading="editorLock.takeoverPending.value"
              :disabled="saving || editorLock.takeoverPending.value"
              @click="requestPageLockTakeover"
            >
              Take over lock
            </UiButton>
          </div>
          <p v-if="errorMessage" class="page-editor__error">{{ errorMessage }}</p>
          <div class="page-editor__footer-actions">
            <UiButton type="button" variant="secondary" @click="resetChanges" :disabled="saving">
              Reset changes
            </UiButton>
            <UiButton type="button" variant="secondary" @click="requestClose" :disabled="saving">
              Close
            </UiButton>
            <UiButton type="button" :disabled="!canSave" @click="saveChanges">
              <span v-if="saving">Saving…</span>
              <span v-else>Save page</span>
            </UiButton>
          </div>
        </footer>
    </div>
  </UiDrawer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw, unref, watch } from 'vue';
import { refreshNuxtData, useNuxtData } from '#app';

import type {
  CardGridBlock,
  CTAListBlock,
  CrewPreviewBlock,
  HeroBlock,
  ImageCarouselBlock,
  PageBlock,
  PageDocument,
  StatGridBlock,
  TimelineBlock,
} from '~/modules/api/schemas';
import { CREW_ROLE_OPTIONS } from '@astralpirates/shared/crewRoles';
import { GALLERY_MEDIA_SOURCE_PREFIXES } from '@astralpirates/shared/mediaUrls';
import { useEditorDocumentLock } from '~/composables/useEditorDocumentLock';
import { usePageEditorState } from '~/composables/usePageEditorState';
import { usePageEditingPermissions } from '~/composables/usePageEditingPermissions';
import GallerySlideAccordionItem from '~/components/gallery/GallerySlideAccordionItem.vue';
import EditableRichTextField from '~/components/page-editor/EditableRichTextField.vue';
import LinkEditorRow from '~/components/page-editor/LinkEditorRow.vue';
import { UiButton, UiDrawer, UiIconButton } from '~/components/ui';
import PageEditorInput from '~/components/page-editor/PageEditorInput.vue';
import { useSessionStore } from '~/stores/session';
import {
  deletePageGalleryImage,
  preparePageUpdatePayload,
  updatePageDocument,
  uploadPageGalleryImage,
} from '~/modules/api/pages';
import {
  extractEditorWriteErrorCode,
  extractEditorWriteErrorMessage,
  extractEditorWriteLock,
} from '~/modules/editor/locks';
import { resolveGalleryUploadDisplayUrl } from '~/modules/media/galleryUrls';
import { normaliseContentPath } from '~/utils/paths';
import {
  GALLERY_FILE_ACCEPT,
  GALLERY_UPLOAD_MAX_FILE_SIZE_LABEL,
  normalizeGalleryMediaType,
} from '~/modules/media/galleryMedia';
import {
  deriveGalleryMediaTitle,
  GALLERY_UPLOAD_FAILED_MESSAGE,
  prepareGalleryUploadCandidate,
  resolveUploadedGalleryMediaType,
} from '~/modules/media/galleryUploadWorkflow';

type NavigationOverrides = NonNullable<PageDocument['navigation']>;

const BLOCK_LABELS: Record<PageBlock['blockType'], string> = {
  hero: 'Hero',
  cardGrid: 'Card grid',
  ctaList: 'CTA list',
  timeline: 'Timeline',
  imageCarousel: 'Image carousel',
  statGrid: 'Stat grid',
  crewPreview: 'Crew preview',
  crewRoster: 'Crew roster',
  navigationModule: 'Navigation module',
};

const editorState = usePageEditorState();
const drawerOpen = computed(() => editorState.isOpen.value);
const permissions = usePageEditingPermissions();
const session = useSessionStore();
const bearer = computed(() => session.bearerToken);
const editorLock = useEditorDocumentLock();

const draft = computed(() => editorState.draft.value);
const layout = computed(() => draft.value?.layout ?? []);
const saving = computed(() => editorState.saving.value);
const errorMessage = computed(() => editorState.errorMessage.value);

const crewRoleOptions = CREW_ROLE_OPTIONS;
const crewRoleOptionsWithAny = computed(() => [
  { label: 'Any', value: '' },
  ...crewRoleOptions,
]);
const cardGridColumnOptions = [
  { label: 'Stacked', value: 'one' },
  { label: 'Two columns', value: 'two' },
  { label: 'Three columns', value: 'three' },
];
const cardVariantOptions = [
  { label: 'Static content', value: 'static' },
  { label: 'Flight plans', value: 'flightPlans' },
  { label: 'Logs', value: 'logs' },
  { label: 'Links', value: 'links' },
];
const carouselImageTypeOptions = [
  { label: 'Upload file', value: 'upload' },
  { label: 'External URL', value: 'url' },
];
const carouselMediaTypeOptions = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: '3D model', value: 'model' },
];
const uploadingCarouselBlockKey = ref<string | null>(null);
const carouselBlockUploadErrors = ref<Record<string, string>>({});
const brokenCarouselSlidePreviewKeys = ref<Set<string>>(new Set());
const pendingCarouselDeleteImageIds = ref<Set<number>>(new Set());
const canUploadPageCarouselImages = computed(() =>
  Boolean(permissions.canEdit.value && draft.value?.id),
);

const resolveDraftPageId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const editablePageId = computed(() => resolveDraftPageId(draft.value?.id));
const lockRequired = computed(
  () => drawerOpen.value && permissions.canEdit.value && editablePageId.value != null,
);
const saveBlockedByLock = computed(
  () =>
    lockRequired.value &&
    (editorLock.status.value === 'acquiring' || editorLock.status.value === 'locked_by_other'),
);

const formatLockExpiry = (value: string | null | undefined): string => {
  if (!value) return 'soon';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'soon';
  try {
    return new Date(parsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'soon';
  }
};

const pageLockNotice = computed(() => {
  if (!lockRequired.value) return '';
  if (editorLock.status.value === 'acquiring') {
    return 'Acquiring page editor lock…';
  }
  if (editorLock.status.value === 'locked_by_other') {
    return `Another editor session holds this page lock until ${formatLockExpiry(editorLock.lock.value?.expiresAt)}. Saving is blocked.`;
  }
  if (editorLock.status.value === 'error') {
    return editorLock.errorMessage.value || 'Unable to verify page lock right now.';
  }
  return '';
});

const pageLockNoticeIsError = computed(
  () => editorLock.status.value === 'locked_by_other' || editorLock.status.value === 'error',
);

const pageLockTakeoverVisible = computed(
  () => lockRequired.value && editorLock.status.value === 'locked_by_other',
);

const syncPageEditorLock = async () => {
  if (!lockRequired.value || editablePageId.value == null) {
    await editorLock.release();
    return;
  }
  await editorLock.start({
    documentType: 'page',
    documentId: editablePageId.value,
    authToken: unref(bearer),
    lockMode: 'soft',
  });
};

function clearCarouselEditorTransientState() {
  uploadingCarouselBlockKey.value = null;
  carouselBlockUploadErrors.value = {};
  brokenCarouselSlidePreviewKeys.value = new Set();
  pendingCarouselDeleteImageIds.value = new Set();
}

const ensureNavigationOverrides = (): NavigationOverrides | null => {
  if (!draft.value) return null;
  if (!draft.value.navigation || typeof draft.value.navigation !== 'object') {
    draft.value.navigation = {
      nodeId: undefined,
      label: null,
      description: null,
    };
  }
  return draft.value.navigation as NavigationOverrides;
};

const navigationEnabled = computed(() => Boolean(draft.value?.navigation));

const navigationNodeId = computed<string>({
  get: () => draft.value?.navigation?.nodeId ?? '',
  set: (value) => {
    const group = ensureNavigationOverrides();
    if (!group) return;
    group.nodeId = value || undefined;
  },
});

const navigationLabel = computed<string>({
  get: () => draft.value?.navigation?.label ?? '',
  set: (value) => {
    const group = ensureNavigationOverrides();
    if (!group) return;
    group.label = value || null;
  },
});

const navigationDescription = computed<string>({
  get: () => draft.value?.navigation?.description ?? '',
  set: (value) => {
    const group = ensureNavigationOverrides();
    if (!group) return;
    group.description = value || null;
  },
});

const pageTitle = computed({
  get: () => draft.value?.title ?? '',
  set: (value: string) => {
    if (!draft.value) return;
    draft.value.title = value;
  },
});

const pageSummary = computed({
  get: () => draft.value?.summary ?? '',
  set: (value: string) => {
    if (!draft.value) return;
    draft.value.summary = value;
  },
});

const blockOptions = Object.entries(BLOCK_LABELS).map(([value, label]) => ({
  value: value as PageBlock['blockType'],
  label,
}));

const newBlockType = ref<PageBlock['blockType']>('hero');

const ensureHeroDefaults = (block: HeroBlock) => {
  block.ctas = Array.isArray(block.ctas) ? block.ctas : [];
  block.tagline = Array.isArray(block.tagline) ? block.tagline : [];
  block.body = Array.isArray(block.body) ? block.body : [];
};

const ensureCardGridDefaults = (block: CardGridBlock) => {
  block.cards = Array.isArray(block.cards) ? block.cards : [];
  block.cards.forEach((card) => {
    card.ctas = Array.isArray(card.ctas) ? card.ctas : [];
    card.body = Array.isArray(card.body) ? card.body : [];
    card.config = card.config ?? {};
  });
};

const ensureCtaListDefaults = (block: CTAListBlock) => {
  block.items = Array.isArray(block.items) ? block.items : [];
  block.intro = Array.isArray(block.intro) ? block.intro : [];
  block.items.forEach((item) => {
    item.description = Array.isArray(item.description) ? item.description : [];
  });
};

const ensureTimelineDefaults = (block: TimelineBlock) => {
  block.items = Array.isArray(block.items) ? block.items : [];
  block.intro = Array.isArray(block.intro) ? block.intro : [];
  block.items.forEach((item) => {
    item.body = Array.isArray(item.body) ? item.body : [];
  });
};

const normalizeCarouselGalleryImage = (
  value: unknown,
): ImageCarouselBlock['slides'][number]['galleryImage'] => {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    return value as ImageCarouselBlock['slides'][number]['galleryImage'];
  }
  return null;
};

const resolveCarouselSlideType = (slide: ImageCarouselBlock['slides'][number]): 'upload' | 'url' => {
  return slide.imageType === 'url' ? 'url' : 'upload';
};

const ensureImageCarouselDefaults = (block: ImageCarouselBlock) => {
  block.intro = Array.isArray(block.intro) ? block.intro : [];
  block.slides = Array.isArray(block.slides) ? block.slides : [];
  if (block.slides.length === 0) {
    block.slides.push({
      label: 'Slide',
      mediaType: 'image',
      imageType: 'upload',
      galleryImage: null,
      imageUrl: '',
      imageAlt: '',
      caption: '',
      creditLabel: '',
      creditUrl: '',
    });
  }
  block.slides.forEach((slide) => {
    slide.label = typeof slide.label === 'string' ? slide.label : '';
    const relationRecord =
      slide.galleryImage && typeof slide.galleryImage === 'object'
        ? (slide.galleryImage as Record<string, unknown>)
        : null;
    slide.mediaType =
      normalizeGalleryMediaType(slide.mediaType) ??
      resolveUploadedGalleryMediaType({
        currentMediaType: slide.mediaType,
        assetMimeType:
          typeof relationRecord?.mimeType === 'string' ? relationRecord.mimeType : undefined,
        assetFilename:
          typeof relationRecord?.filename === 'string' ? relationRecord.filename : undefined,
        imageUrl: slide.imageUrl,
      });
    slide.imageType = resolveCarouselSlideType(slide);
    slide.galleryImage = normalizeCarouselGalleryImage(slide.galleryImage);
    slide.imageUrl = typeof slide.imageUrl === 'string' ? slide.imageUrl : '';
    slide.imageAlt = typeof slide.imageAlt === 'string' ? slide.imageAlt : '';
    slide.caption = typeof slide.caption === 'string' ? slide.caption : '';
    slide.creditLabel = typeof slide.creditLabel === 'string' ? slide.creditLabel : '';
    slide.creditUrl = typeof slide.creditUrl === 'string' ? slide.creditUrl : '';
  });
};

const ensureStatGridDefaults = (block: StatGridBlock) => {
  block.stats = Array.isArray(block.stats) ? block.stats : [];
  block.ctas = Array.isArray(block.ctas) ? block.ctas : [];
  block.intro = Array.isArray(block.intro) ? block.intro : [];
};

const ensureCrewPreviewDefaults = (block: CrewPreviewBlock) => {
  block.description = Array.isArray(block.description) ? block.description : [];
};

const ensureBlockDefaults = (block: PageBlock) => {
  switch (block.blockType) {
    case 'hero':
      ensureHeroDefaults(block as HeroBlock);
      break;
    case 'cardGrid':
      ensureCardGridDefaults(block as CardGridBlock);
      break;
    case 'ctaList':
      ensureCtaListDefaults(block as CTAListBlock);
      break;
    case 'timeline':
      ensureTimelineDefaults(block as TimelineBlock);
      break;
    case 'imageCarousel':
      ensureImageCarouselDefaults(block as ImageCarouselBlock);
      break;
    case 'statGrid':
      ensureStatGridDefaults(block as StatGridBlock);
      break;
    case 'crewPreview':
      ensureCrewPreviewDefaults(block as CrewPreviewBlock);
      break;
    default:
      break;
  }
};

const ensurePageDefaults = (page: PageDocument) => {
  page.layout = Array.isArray(page.layout) ? page.layout : [];
  page.layout.forEach((block) => ensureBlockDefaults(block));
};

watch(
  () => editorState.isOpen.value,
  (open) => {
    if (open && draft.value) {
      ensurePageDefaults(draft.value);
      return;
    }
    clearCarouselEditorTransientState();
  },
  { immediate: true },
);

watch(
  [drawerOpen, () => permissions.canEdit.value, editablePageId, bearer],
  () => {
    void syncPageEditorLock();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  void editorLock.release();
});

const blockKey = (block: PageBlock, index: number) => {
  const rawId = (block as Record<string, unknown>).id;
  return rawId ? String(rawId) : `${block.blockType}-${index}`;
};

const createBlockTemplate = (type: PageBlock['blockType']): PageBlock => {
  switch (type) {
    case 'hero':
      return {
        blockType: 'hero',
        eyebrow: '',
        title: 'New hero',
        tagline: [],
        body: [],
        ctas: [],
      };
    case 'cardGrid':
      return {
        blockType: 'cardGrid',
        title: 'Card grid',
        intro: [],
        columns: 'three',
        cards: [
          {
            variant: 'static',
            badge: '',
            title: 'Card title',
            body: [],
            ctas: [],
            config: {},
          },
        ],
      };
    case 'ctaList':
      return {
        blockType: 'ctaList',
        title: 'Call to action list',
        intro: [],
        items: [
          {
            title: 'List item',
            description: [],
          },
        ],
      };
    case 'timeline':
      return {
        blockType: 'timeline',
        title: 'Timeline',
        intro: [],
        items: [
          {
            heading: 'Event title',
            timestamp: '',
            body: [],
          },
        ],
      };
    case 'imageCarousel':
      return {
        blockType: 'imageCarousel',
        title: 'Image carousel',
        intro: [],
        slides: [
          {
            label: 'Slide 1',
            mediaType: 'image',
            imageType: 'upload',
            galleryImage: null,
            imageUrl: '',
            imageAlt: '',
            caption: '',
            creditLabel: '',
            creditUrl: '',
          },
          {
            label: 'Slide 2',
            mediaType: 'image',
            imageType: 'upload',
            galleryImage: null,
            imageUrl: '',
            imageAlt: '',
            caption: '',
            creditLabel: '',
            creditUrl: '',
          },
        ],
      };
    case 'statGrid':
      return {
        blockType: 'statGrid',
        title: 'Stats',
        intro: [],
        stats: [
          {
            value: '42',
            label: 'Stat label',
          },
        ],
        ctas: [],
      };
    case 'crewPreview':
      return {
        blockType: 'crewPreview',
        title: 'Crew preview',
        description: [],
        minRole: '',
        limit: 3,
        cta: undefined,
      };
    default:
      return { blockType: type } as PageBlock;
  }
};

const moveItem = <T,>(items: T[], index: number, offset: number) => {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= items.length) return;
  const [item] = items.splice(index, 1);
  if (item === undefined) return;
  items.splice(nextIndex, 0, item);
};

const duplicateItem = <T,>(items: T[], index: number, clone: (item: T) => T) => {
  const original = items[index];
  if (original === undefined) return;
  items.splice(index + 1, 0, clone(original));
};

const cloneBlock = (block: PageBlock): PageBlock => JSON.parse(JSON.stringify(block));

const addBlock = () => {
  if (!draft.value) return;
  const block = createBlockTemplate(newBlockType.value);
  ensureBlockDefaults(block);
  draft.value.layout.push(block);
};

const removeBlock = (index: number) => {
  if (!draft.value) return;
  const target = draft.value.layout[index];
  if (target?.blockType === 'imageCarousel') {
    const carousel = target as ImageCarouselBlock;
    for (const slide of carousel.slides ?? []) {
      queueCarouselSlideUploadDelete(slide);
    }
    brokenCarouselSlidePreviewKeys.value = new Set();
  }
  draft.value.layout.splice(index, 1);
};

const moveBlock = (index: number, offset: number) => {
  if (!draft.value) return;
  moveItem(draft.value.layout, index, offset);
};

const duplicateBlock = (index: number) => {
  if (!draft.value) return;
  duplicateItem(draft.value.layout, index, (item) => cloneBlock(item));
};

const formatBlockLabel = (type: PageBlock['blockType']) => BLOCK_LABELS[type] ?? type;

const resolveBlockHeading = (block: PageBlock, index: number) => {
  switch (block.blockType) {
    case 'hero':
      return (block as HeroBlock).title || `Hero ${index + 1}`;
    case 'cardGrid':
      return (block as CardGridBlock).title || `Card grid ${index + 1}`;
    case 'ctaList':
      return (block as CTAListBlock).title || `CTA list ${index + 1}`;
    case 'timeline':
      return (block as TimelineBlock).title || `Timeline ${index + 1}`;
    case 'imageCarousel':
      return (block as ImageCarouselBlock).title || `Image carousel ${index + 1}`;
    case 'statGrid':
      return (block as StatGridBlock).title || `Stat grid ${index + 1}`;
    case 'crewPreview':
      return (block as CrewPreviewBlock).title || `Crew preview ${index + 1}`;
    default:
      return `${block.blockType} ${index + 1}`;
  }
};

const asHero = (block: PageBlock) => block as HeroBlock;
const asCardGrid = (block: PageBlock) => block as CardGridBlock;
const asCtaList = (block: PageBlock) => block as CTAListBlock;
const asTimeline = (block: PageBlock) => block as TimelineBlock;
const asImageCarousel = (block: PageBlock) => block as ImageCarouselBlock;
const asStatGrid = (block: PageBlock) => block as StatGridBlock;
const asCrewPreview = (block: PageBlock) => block as CrewPreviewBlock;
const heroCtas = (hero: HeroBlock) => {
  hero.ctas = Array.isArray(hero.ctas) ? hero.ctas : [];
  return hero.ctas;
};
const cardCtas = (card: CardGridBlock['cards'][number]) => {
  card.ctas = Array.isArray(card.ctas) ? card.ctas : [];
  return card.ctas;
};
const cardConfig = (card: CardGridBlock['cards'][number]) => {
  card.config = card.config ?? {};
  return card.config;
};
const statCtas = (block: StatGridBlock) => {
  block.ctas = Array.isArray(block.ctas) ? block.ctas : [];
  return block.ctas;
};

const addHeroCta = (hero: HeroBlock) => {
  heroCtas(hero).push({
    label: 'New link',
    href: '/',
    style: 'primary',
  });
};

const removeHeroCta = (hero: HeroBlock, index: number) => {
  heroCtas(hero).splice(index, 1);
};

const createCardTemplate = (): CardGridBlock['cards'][number] => ({
  variant: 'static',
  badge: '',
  title: 'Card title',
  body: [],
  ctas: [],
  config: {},
});

const addCard = (block: CardGridBlock) => {
  block.cards.push(createCardTemplate());
};

const removeCard = (block: CardGridBlock, index: number) => {
  block.cards.splice(index, 1);
};

const moveCard = (block: CardGridBlock, index: number, offset: number) => {
  moveItem(block.cards, index, offset);
};

const addCardCta = (card: CardGridBlock['cards'][number]) => {
  card.ctas = Array.isArray(card.ctas) ? card.ctas : [];
  card.ctas.push({
    label: 'New link',
    href: '/',
    style: 'primary',
  });
};

const removeCardCta = (card: CardGridBlock['cards'][number], index: number) => {
  card.ctas?.splice(index, 1);
};

const addCtaListItem = (block: CTAListBlock) => {
  block.items.push({
    title: 'New item',
    description: [],
  });
};

const removeCtaListItem = (block: CTAListBlock, index: number) => {
  block.items.splice(index, 1);
};

const moveCtaListItem = (block: CTAListBlock, index: number, offset: number) => {
  moveItem(block.items, index, offset);
};

const addCtaListLink = (item: CTAListBlock['items'][number]) => {
  item.cta = {
    label: 'Learn more',
    href: '/',
    style: 'primary',
  };
};

const removeCtaListLink = (item: CTAListBlock['items'][number]) => {
  item.cta = undefined;
};

const addTimelineItem = (block: TimelineBlock) => {
  block.items.push({
    heading: 'Timeline entry',
    timestamp: '',
    body: [],
  });
};

const removeTimelineItem = (block: TimelineBlock, index: number) => {
  block.items.splice(index, 1);
};

const moveTimelineItem = (block: TimelineBlock, index: number, offset: number) => {
  moveItem(block.items, index, offset);
};

const addCarouselSlide = (block: ImageCarouselBlock) => {
  block.slides.push({
    label: `Slide ${block.slides.length + 1}`,
    mediaType: 'image',
    imageType: 'upload',
    galleryImage: null,
    imageUrl: '',
    imageAlt: '',
    caption: '',
    creditLabel: '',
    creditUrl: '',
  });
  brokenCarouselSlidePreviewKeys.value = new Set();
};

const carouselSlideKey = (blockIndex: number, slideIndex: number) =>
  `${blockIndex}:${slideIndex}`;

const carouselSlideAccordionId = (blockIndex: number, slideIndex: number) =>
  `page-carousel-slide-${blockIndex}-${slideIndex}`;

const carouselSlideAccordionTitle = (
  slide: ImageCarouselBlock['slides'][number],
  index: number,
): string => {
  const label = typeof slide.label === 'string' ? slide.label.trim() : '';
  if (label.length > 0) return `Slide ${index + 1}: ${label}`;
  const mediaType = normalizeGalleryMediaType(slide.mediaType) ?? 'image';
  if (mediaType === 'video') return `Slide ${index + 1}: Video`;
  if (mediaType === 'audio') return `Slide ${index + 1}: Audio`;
  if (mediaType === 'model') return `Slide ${index + 1}: 3D model`;
  return `Slide ${index + 1}: Image`;
};

const isCarouselSlidePreviewBroken = (blockIndex: number, slideIndex: number): boolean =>
  brokenCarouselSlidePreviewKeys.value.has(carouselSlideKey(blockIndex, slideIndex));

const markCarouselSlidePreviewBroken = (blockIndex: number, slideIndex: number) => {
  const key = carouselSlideKey(blockIndex, slideIndex);
  if (brokenCarouselSlidePreviewKeys.value.has(key)) return;
  const next = new Set(brokenCarouselSlidePreviewKeys.value);
  next.add(key);
  brokenCarouselSlidePreviewKeys.value = next;
};

const clearCarouselSlidePreviewBroken = (blockIndex: number, slideIndex: number) => {
  const key = carouselSlideKey(blockIndex, slideIndex);
  if (!brokenCarouselSlidePreviewKeys.value.has(key)) return;
  const next = new Set(brokenCarouselSlidePreviewKeys.value);
  next.delete(key);
  brokenCarouselSlidePreviewKeys.value = next;
};

const resolveCarouselSlideUploadId = (
  slide: ImageCarouselBlock['slides'][number] | undefined,
): number | null => {
  if (!slide || resolveCarouselSlideType(slide) !== 'upload') return null;
  const relation = normalizeCarouselGalleryImage(slide.galleryImage);
  if (typeof relation === 'number') {
    return Number.isFinite(relation) ? relation : null;
  }
  if (!relation || typeof relation !== 'object') return null;
  const id = (relation as Record<string, unknown>).id;
  if (typeof id === 'number' && Number.isFinite(id)) return id;
  if (typeof id === 'string') {
    const parsed = Number.parseInt(id, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const queueCarouselUploadDeleteId = (imageId: number | null) => {
  if (imageId == null || !Number.isFinite(imageId)) return;
  if (pendingCarouselDeleteImageIds.value.has(imageId)) return;
  const next = new Set(pendingCarouselDeleteImageIds.value);
  next.add(imageId);
  pendingCarouselDeleteImageIds.value = next;
};

const queueCarouselSlideUploadDelete = (
  slide: ImageCarouselBlock['slides'][number] | undefined,
) => {
  queueCarouselUploadDeleteId(resolveCarouselSlideUploadId(slide));
};

const resolveCarouselSlidePreviewUrl = (
  slide: ImageCarouselBlock['slides'][number],
): string | null => {
  const relation = normalizeCarouselGalleryImage(slide.galleryImage);
  const relationRecord =
    relation && typeof relation === 'object'
      ? (relation as Record<string, unknown>)
      : null;
  const relationUrl = typeof relationRecord?.url === 'string' ? relationRecord.url : null;
  const relationFilename =
    typeof relationRecord?.filename === 'string' ? relationRecord.filename : null;

  return resolveGalleryUploadDisplayUrl({
    imageType: resolveCarouselSlideType(slide),
    imageUrl: slide.imageUrl ?? relationUrl ?? '',
    asset: relationRecord
      ? {
          url: relationUrl,
          filename: relationFilename,
        }
      : null,
  });
};

const removeCarouselSlide = (block: ImageCarouselBlock, blockIndex: number, index: number) => {
  const target = block.slides[index];
  queueCarouselSlideUploadDelete(target);
  clearCarouselSlidePreviewBroken(blockIndex, index);
  block.slides.splice(index, 1);
  brokenCarouselSlidePreviewKeys.value = new Set();
};

const moveCarouselSlide = (block: ImageCarouselBlock, index: number, offset: number) => {
  moveItem(block.slides, index, offset);
  brokenCarouselSlidePreviewKeys.value = new Set();
};

const carouselBlockKey = (blockIndex: number) => `carousel-block:${blockIndex}`;

const isCarouselBlockUploading = (blockIndex: number): boolean =>
  uploadingCarouselBlockKey.value === carouselBlockKey(blockIndex);

const carouselBlockUploadError = (blockIndex: number): string =>
  carouselBlockUploadErrors.value[carouselBlockKey(blockIndex)] ?? '';

const setCarouselBlockUploadError = (blockIndex: number, message: string) => {
  carouselBlockUploadErrors.value = {
    ...carouselBlockUploadErrors.value,
    [carouselBlockKey(blockIndex)]: message,
  };
};

const carouselRemainingSlots = (block: ImageCarouselBlock): number => {
  const slideCount = Array.isArray(block.slides) ? block.slides.length : 0;
  return Math.max(8 - slideCount, 0);
};

const looksLikeGalleryUploadUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const hasGalleryPrefix = (pathname: string): boolean =>
    GALLERY_MEDIA_SOURCE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (hasGalleryPrefix(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return hasGalleryPrefix(parsed.pathname);
  } catch {
    return false;
  }
};

const setCarouselSlideImageType = (
  slide: ImageCarouselBlock['slides'][number],
  value: string | number | null,
) => {
  const next = typeof value === 'string' ? value : value == null ? '' : String(value);
  if (next === 'url') {
    queueCarouselSlideUploadDelete(slide);
    slide.imageType = 'url';
    slide.galleryImage = null;
    if (typeof slide.imageUrl === 'string' && looksLikeGalleryUploadUrl(slide.imageUrl)) {
      slide.imageUrl = '';
    }
    return;
  }
  slide.imageType = 'upload';
};

const setCarouselSlideMediaType = (
  slide: ImageCarouselBlock['slides'][number],
  value: string | number | null,
) => {
  const next = typeof value === 'string' ? value : value == null ? '' : String(value);
  slide.mediaType = normalizeGalleryMediaType(next) ?? 'image';
};

const resolvePageIdForCarouselUpload = (): number | null => {
  return resolveDraftPageId(draft.value?.id);
};

const uploadCarouselFilesForBlock = async (blockIndex: number, files: File[]) => {
  if (!files.length) return;

  const key = carouselBlockKey(blockIndex);
  setCarouselBlockUploadError(blockIndex, '');

  if (uploadingCarouselBlockKey.value) {
    setCarouselBlockUploadError(blockIndex, 'Upload already in progress.');
    return;
  }

  if (!canUploadPageCarouselImages.value || !draft.value?.id) {
    setCarouselBlockUploadError(blockIndex, 'Save this page first to upload media.');
    return;
  }

  const block = layout.value[blockIndex];
  if (!block || block.blockType !== 'imageCarousel') return;
  const carousel = block as ImageCarouselBlock;

  const pageId = resolvePageIdForCarouselUpload();
  if (pageId == null) {
    setCarouselBlockUploadError(blockIndex, 'Page must be saved before uploading media.');
    return;
  }

  const availableSlots = carouselRemainingSlots(carousel);
  if (!availableSlots) {
    setCarouselBlockUploadError(blockIndex, 'Carousel is full. Remove a slide to upload another file.');
    return;
  }

  const candidates = files.slice(0, availableSlots);
  const queue: Array<{ sourceFile: File; uploadFile: File }> = [];
  const validationErrors: string[] = [];

  for (const sourceFile of candidates) {
    const prepared = await prepareGalleryUploadCandidate(sourceFile);
    if (prepared.error) {
      validationErrors.push(`${sourceFile.name}: ${prepared.error}`);
      continue;
    }
    if (prepared.candidate) {
      queue.push(prepared.candidate);
    }
  }

  const queueLimitError =
    candidates.length < files.length
      ? `Only ${availableSlots} slot${availableSlots === 1 ? '' : 's'} available. Extra files were ignored.`
      : '';

  if (!queue.length) {
    setCarouselBlockUploadError(
      blockIndex,
      validationErrors[0] ?? queueLimitError ?? GALLERY_UPLOAD_FAILED_MESSAGE,
    );
    return;
  }

  uploadingCarouselBlockKey.value = key;
  setCarouselBlockUploadError(blockIndex, validationErrors[0] ?? queueLimitError);

  for (const queued of queue) {
    const sourceFile = queued.sourceFile;
    try {
      const upload = await uploadPageGalleryImage({
        pageId,
        file: queued.uploadFile,
      });
      if (!upload?.asset?.id || !upload.imageUrl) {
        throw new Error(GALLERY_UPLOAD_FAILED_MESSAGE);
      }

      const title = deriveGalleryMediaTitle(sourceFile.name);
      carousel.slides.push({
        label: title,
        mediaType: resolveUploadedGalleryMediaType({
          assetMimeType: upload.asset.mimeType,
          assetFilename: upload.asset.filename ?? sourceFile.name,
          imageUrl: upload.imageUrl,
        }),
        imageType: 'upload',
        galleryImage: upload.asset.id,
        imageUrl: upload.imageUrl,
        imageAlt: title,
        caption: '',
        creditLabel: '',
        creditUrl: '',
      });
      brokenCarouselSlidePreviewKeys.value = new Set();
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : GALLERY_UPLOAD_FAILED_MESSAGE;
      setCarouselBlockUploadError(blockIndex, message);
      break;
    }
  }

  if (uploadingCarouselBlockKey.value === key) {
    uploadingCarouselBlockKey.value = null;
  }
};

const triggerCarouselBlockUpload = (blockIndex: number) => {
  if (!canUploadPageCarouselImages.value || !draft.value?.id) {
    setCarouselBlockUploadError(blockIndex, 'Save this page first to upload media.');
    return;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = GALLERY_FILE_ACCEPT;
  input.multiple = true;
  input.onchange = async () => {
    const files = input.files ? Array.from(input.files) : [];
    await uploadCarouselFilesForBlock(blockIndex, files);
    input.value = '';
  };

  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch {
      // Fall through to click for browsers that reject showPicker.
    }
  }
  input.click();
};

const hasCarouselSlideUploadReference = (slide: ImageCarouselBlock['slides'][number]): boolean => {
  const relation = normalizeCarouselGalleryImage(slide.galleryImage);
  if (typeof relation === 'number') return Number.isFinite(relation);
  if (!relation || typeof relation !== 'object') return false;
  const relationRecord = relation as Record<string, unknown>;
  if (!('id' in relationRecord)) {
    return Object.keys(relationRecord).length > 0;
  }
  const id = relationRecord.id;
  if (typeof id === 'number') return Number.isFinite(id);
  if (typeof id === 'string') return id.trim().length > 0;
  return false;
};

const validateCarouselBlocks = (): string | null => {
  if (!draft.value) return null;
  for (let blockIndex = 0; blockIndex < draft.value.layout.length; blockIndex += 1) {
    const block = draft.value.layout[blockIndex];
    if (!block || block.blockType !== 'imageCarousel') continue;
    const carousel = block as ImageCarouselBlock;
    const slides = Array.isArray(carousel.slides) ? carousel.slides : [];
    if (!slides.length) {
      return `Image carousel ${blockIndex + 1}: add at least one slide.`;
    }
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      const slide = slides[slideIndex];
      if (!slide) continue;
      const alt = typeof slide.imageAlt === 'string' ? slide.imageAlt.trim() : '';
      if (!alt.length) {
        return `Image carousel ${blockIndex + 1}, slide ${slideIndex + 1}: alt text is required.`;
      }
      const type = resolveCarouselSlideType(slide);
      if (type === 'url') {
        const imageUrl = typeof slide.imageUrl === 'string' ? slide.imageUrl.trim() : '';
        if (!imageUrl.length) {
          return `Image carousel ${blockIndex + 1}, slide ${slideIndex + 1}: provide a media URL or switch source to upload.`;
        }
      } else if (!hasCarouselSlideUploadReference(slide)) {
        return `Image carousel ${blockIndex + 1}, slide ${slideIndex + 1}: upload media or switch source to URL.`;
      }
    }
  }
  return null;
};

const addStat = (block: StatGridBlock) => {
  block.stats.push({
    value: '42',
    label: 'Label',
  });
};

const removeStat = (block: StatGridBlock, index: number) => {
  block.stats.splice(index, 1);
};

const moveStat = (block: StatGridBlock, index: number, offset: number) => {
  moveItem(block.stats, index, offset);
};

const addStatCta = (block: StatGridBlock) => {
  block.ctas = Array.isArray(block.ctas) ? block.ctas : [];
  block.ctas.push({
    label: 'Learn more',
    href: '/',
    style: 'primary',
  });
};

const removeStatCta = (block: StatGridBlock, index: number) => {
  block.ctas?.splice(index, 1);
};

const addCrewPreviewCta = (block: CrewPreviewBlock) => {
  block.cta = {
    label: 'Meet the crew',
    href: '/',
    style: 'primary',
  };
};

const removeCrewPreviewCta = (block: CrewPreviewBlock) => {
  block.cta = undefined;
};

const clearNavigation = () => {
  if (!draft.value) return;
  draft.value.navigation = null as PageDocument['navigation'];
};

const statusCodeFromError = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  if (typeof record.statusCode === 'number') return record.statusCode;
  if (record.response && typeof record.response === 'object') {
    const response = record.response as Record<string, unknown>;
    if (typeof response.status === 'number') return response.status;
  }
  return null;
};

const flushPendingCarouselUploadDeletes = async (): Promise<string | null> => {
  const pendingIds = Array.from(pendingCarouselDeleteImageIds.value);
  if (!pendingIds.length) return null;

  let firstFailureMessage = '';
  for (const imageId of pendingIds) {
    try {
      await deletePageGalleryImage({ imageId });
      const next = new Set(pendingCarouselDeleteImageIds.value);
      next.delete(imageId);
      pendingCarouselDeleteImageIds.value = next;
    } catch (error: unknown) {
      const statusCode = statusCodeFromError(error);
      if (statusCode === 404) {
        const next = new Set(pendingCarouselDeleteImageIds.value);
        next.delete(imageId);
        pendingCarouselDeleteImageIds.value = next;
        continue;
      }
      if (!firstFailureMessage) {
        if (error instanceof Error && error.message.trim().length > 0) {
          firstFailureMessage = error.message.trim();
        } else {
          const fallback =
            typeof (error as { data?: { error?: unknown } })?.data?.error === 'string'
              ? (error as { data: { error: string } }).data.error.trim()
              : '';
          firstFailureMessage = fallback || 'Unable to remove one or more media files.';
        }
      }
    }
  }

  const failedCount = pendingCarouselDeleteImageIds.value.size;
  if (failedCount === 0) return null;

  const noun = failedCount === 1 ? 'media file' : 'media files';
  return `Page saved, but failed to remove ${failedCount} ${noun}. Save again to retry cleanup. ${firstFailureMessage}`.trim();
};

const requestClose = () => {
  if (editorState.hasChanges.value && !window.confirm('Discard unsaved changes?')) {
    return false;
  }
  void editorLock.release();
  clearCarouselEditorTransientState();
  editorState.closeEditor();
  return true;
};

const handleDrawerToggle = (next: boolean) => {
  if (!next) {
    requestClose();
  }
};

const resetChanges = () => {
  clearCarouselEditorTransientState();
  editorState.resetDraft();
  if (draft.value) {
    ensurePageDefaults(draft.value);
  }
};

const canSave = computed(() => {
  if (!permissions.canEdit.value) return false;
  if (!draft.value) return false;
  if (saveBlockedByLock.value) return false;
  if (!draft.value.title || !draft.value.title.trim()) return false;
  return !saving.value;
});

const saveChanges = async () => {
  if (!draft.value || !canSave.value) return;
  if (saveBlockedByLock.value) {
    editorState.setError(pageLockNotice.value || 'Saving is blocked by another editor lock.');
    return;
  }
  if (uploadingCarouselBlockKey.value) {
    editorState.setError('Please wait for media uploads to finish before saving.');
    return;
  }
  const carouselValidationError = validateCarouselBlocks();
  if (carouselValidationError) {
    editorState.setError(carouselValidationError);
    return;
  }

  editorState.setError(null);
  editorState.setSaving(true);

  try {
    const rawDraft = toRaw(draft.value);
    const plainDraft = JSON.parse(JSON.stringify(rawDraft));
    const payload = preparePageUpdatePayload(plainDraft);
    const updated = await updatePageDocument(plainDraft.id, payload);
    const cleanupWarning = await flushPendingCarouselUploadDeletes();
    const targetPath = normaliseContentPath(updated.path ?? payload.path);
    const refreshKey = `page-doc-${targetPath || 'home'}`;

    const nuxtData = useNuxtData<PageDocument | null>(refreshKey);
    if (nuxtData?.data) {
      nuxtData.data.value = updated;
    }

    if (cleanupWarning) {
      editorState.openEditor(updated);
      if (draft.value) {
        ensurePageDefaults(draft.value);
      }
      editorState.setError(cleanupWarning);
      return;
    }

    clearCarouselEditorTransientState();
    editorState.closeEditor();

    void refreshNuxtData(refreshKey).catch((error) => {
      if (process.dev) {
        // eslint-disable-next-line no-console
        console.warn('[PageEditorDrawer] Failed to refresh page content', error);
      }
    });
  } catch (error: unknown) {
    const statusCode = statusCodeFromError(error);
    const errorCode = extractEditorWriteErrorCode(error);
    const lock = extractEditorWriteLock(error);
    let message = extractEditorWriteErrorMessage(error, 'Failed to save page changes');

    if (statusCode === 409 && errorCode === 'revision_conflict') {
      message = 'Page changed on the server. Reload the page and retry your save.';
    }
    if ((statusCode === 423 || errorCode === 'editor_locked') && lock) {
      editorLock.setForeignLock(lock, message);
      message = `Page is locked by another editor session until ${formatLockExpiry(lock.expiresAt)}.`;
    }

    editorState.setError(message);
  } finally {
    editorState.setSaving(false);
  }
};

const requestPageLockTakeover = async () => {
  if (!pageLockTakeoverVisible.value || typeof window === 'undefined') return;
  const reason = window.prompt(
    'Take over this page lock? Provide a short reason for the audit log.',
    'Previous editor session appears inactive.',
  );
  if (!reason || !reason.trim()) return;

  const tookOver = await editorLock.takeover(reason);
  if (tookOver) {
    editorState.setError(null);
    return;
  }

  editorState.setError(editorLock.errorMessage.value || 'Unable to take over page lock.');
};
</script>

<style scoped>
:global(.page-editor) {
  --page-editor-panel-max-width: calc(var(--size-avatar-hero) * 5.9091);
  --page-editor-border-width: var(--size-base-layout-px);
  --page-editor-gap-upload: calc(var(--space-xs) * 0.8);
  --page-editor-path-font-size: calc(var(--crew-identity-meta-font-size) * 1.2143);
  --page-editor-title-font-size: var(--space-lg);
  --page-editor-section-title-font-size: calc(var(--size-base-space-rem) * 1.25);
  --page-editor-hint-font-size: calc(var(--crew-identity-meta-font-size) * 1.2143);
  --page-editor-lock-notice-font-size: calc(var(--size-base-space-rem) * 0.875);
  --page-editor-card-radius: var(--space-sm);
  --page-editor-subsection-radius: calc(var(--size-base-space-rem) * 0.65);
  --page-editor-field-min-width: calc(var(--size-avatar-hero) * 1.3636);
  --page-editor-control-radius: calc(var(--space-xs) * 0.8);
  --page-editor-control-size: var(--space-xl);
  --page-editor-button-sm-padding-block: var(--crew-identity-gap);
  --page-editor-button-sm-padding-inline: calc(var(--size-base-space-rem) * 0.65);
  --page-editor-button-sm-font-size: calc(var(--crew-identity-meta-font-size) * 1.1429);
  --page-editor-badge-font-size: var(--crew-identity-meta-font-size);
  --page-editor-badge-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.625);
  justify-content: flex-end;
  align-items: stretch;
  z-index: var(--z-overlay-drawer);
}

:global(.page-editor .ui-drawer__panel) {
  width: min(var(--page-editor-panel-max-width), 100%);
  max-width: 100%;
  background: var(--color-surface-dialog);
  border-left: var(--page-editor-border-width) solid var(--color-border-weak);
}

:global(.page-editor .ui-drawer__body) {
  padding: 0;
  height: 100%;
}

.page-editor__panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.page-editor__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-lg) var(--status-toggle-indent-base) var(--space-md);
  border-bottom: var(--page-editor-border-width) solid var(--color-border-weak);
}

.page-editor__title {
  margin: 0;
  font-size: var(--page-editor-title-font-size);
}

.page-editor__subtitle {
  margin: var(--space-2xs) 0 0;
  font-size: var(--space-md);
  opacity: 0.85;
}

.page-editor__path {
  margin: var(--space-2xs) 0 0;
  font-size: var(--page-editor-path-font-size);
  opacity: 0.7;
}

.page-editor__close {
  background: none;
  border: none;
  color: inherit;
  font-size: var(--status-toggle-indent-base);
  cursor: pointer;
  line-height: 1;
}

.page-editor__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg) var(--status-toggle-indent-base) var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.page-editor__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.page-editor__section-title {
  margin: 0;
  font-size: var(--page-editor-section-title-font-size);
}

.page-editor__field-grid {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fit, minmax(var(--page-editor-field-min-width), 1fr));
}

.page-editor__details {
  background: var(--color-surface-panel);
  border-radius: var(--page-editor-card-radius);
  padding: var(--space-md);
  border: var(--page-editor-border-width) solid var(--color-border-weak);
}

.page-editor__details summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: var(--space-md);
}

.page-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.page-editor__actions--inline {
  justify-content: flex-start;
}

.page-editor__upload {
  display: flex;
  flex-direction: column;
  gap: var(--page-editor-gap-upload);
}

.page-editor__hint {
  margin: 0;
  font-size: var(--page-editor-hint-font-size);
  opacity: 0.75;
}

.page-editor__add-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-top: var(--space-md);
  border-top: var(--page-editor-border-width) solid var(--color-border-weak);
}

.page-editor__add-controls {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.page-editor__add-controls :deep(.ui-form-field) {
  flex: 1;
}

.page-editor__lock-notice {
  margin: 0;
  font-size: var(--page-editor-lock-notice-font-size);
  color: var(--color-text-secondary);
}

.page-editor__lock-notice--error {
  color: var(--color-danger);
}

.page-editor-block {
  background: var(--color-surface-base);
  border-radius: var(--page-editor-card-radius);
  border: var(--page-editor-border-width) solid var(--color-border-weak);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md) var(--page-editor-section-title-font-size);
}

.page-editor-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.page-editor-block__badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-pill);
  background: var(--color-surface-base);
  font-size: var(--page-editor-badge-font-size);
  text-transform: uppercase;
  letter-spacing: var(--page-editor-badge-letter-spacing);
  margin-right: var(--space-xs);
}

.page-editor-block__heading {
  font-size: var(--space-md);
}

.page-editor-block__controls {
  display: flex;
  gap: var(--page-editor-gap-upload);
}

.page-editor-block__control {
  border: none;
  background: var(--color-surface-base);
  color: inherit;
  border-radius: var(--page-editor-control-radius);
  width: var(--page-editor-control-size);
  height: var(--page-editor-control-size);
  cursor: pointer;
}

.page-editor-block__control:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-editor-block__control--danger {
  background: var(--color-surface-danger-weak);
}

.page-editor-block__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.page-editor__subsection {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--page-editor-subsection-radius);
  background: var(--color-surface-base);
}

.page-editor__subsection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
}

.page-editor__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-xs);
  border-top: var(--page-editor-border-width) solid var(--color-border-weak);
}

.page-editor__card:first-child {
  border-top: none;
  padding-top: 0;
}

.page-editor__card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
}

.page-editor__card-controls {
  display: flex;
  gap: var(--page-editor-gap-upload);
}

.page-editor__subsection-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-2xs);
  border-top: var(--page-editor-border-width) dashed var(--color-border-weak);
}

.page-editor__subsection-item:first-child {
  border-top: none;
}

.page-editor__empty {
  margin: 0;
  opacity: 0.7;
}

.page-editor__footer {
  padding: var(--space-md) var(--status-toggle-indent-base) var(--space-lg);
  border-top: var(--page-editor-border-width) solid var(--color-border-weak);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.page-editor__footer-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.page-editor__error {
  margin: 0;
  color: var(--color-danger);
}

.page-editor__error--inline {
  font-size: var(--page-editor-hint-font-size);
}

.button-sm {
  padding: var(--page-editor-button-sm-padding-block) var(--page-editor-button-sm-padding-inline);
  font-size: var(--page-editor-button-sm-font-size);
}
</style>
