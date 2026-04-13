import type { Block } from 'payload';

export type RichTextNode = {
  type?: string;
  url?: string;
  newTab?: boolean;
  children: Array<
    | {
        text: string;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strikethrough?: boolean;
      }
    | RichTextNode
  >;
};

const toArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const text = (
  value: string,
  marks: Partial<{ bold: boolean; italic: boolean; underline: boolean }> = {},
) => ({
  text: value,
  ...marks,
});

const paragraph = (value: string): RichTextNode => ({
  type: 'paragraph',
  children: [text(value)],
});

export const listItem = (value: string): RichTextNode => ({
  type: 'li',
  children: [text(value)],
});

export const unorderedList = (items: string[]): RichTextNode => ({
  type: 'ul',
  children: items.filter((item) => item.trim().length > 0).map(listItem),
});

export const richText = (...nodes: Array<RichTextNode | undefined>): RichTextNode[] =>
  nodes.filter((node): node is RichTextNode => Boolean(node));

export const paragraphs = (...values: string[]): RichTextNode[] =>
  values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map(paragraph);

type CTA = {
  label: string;
  href: string;
  style?: 'primary' | 'secondary' | 'link';
};

type PageBlock = Record<string, unknown> & { blockType: string };

export type PageDefinition = {
  title: string;
  path: string;
  summary?: string;
  navigation?: {
    nodeId: string;
    label?: string;
    description?: string;
  };
  layout: PageBlock[];
  legacyPaths?: string[];
  notes?: string[];
};

const makeHeroBlock = ({
  eyebrow,
  title,
  tagline,
  body,
  ctas,
}: {
  eyebrow?: string;
  title: string;
  tagline?: string | string[];
  body?: string | string[];
  ctas?: CTA[];
}): PageBlock => ({
  blockType: 'hero',
  eyebrow: eyebrow ?? null,
  title,
  tagline: tagline ? richText(...paragraphs(...toArray(tagline))) : [],
  body: body ? richText(...paragraphs(...toArray(body))) : [],
  ctas: (ctas ?? [])
    .filter((cta) => Boolean(cta?.label && cta?.href))
    .map((cta) => ({
      label: cta.label,
      href: cta.href,
      style: cta.style ?? 'primary',
    })),
});

const makeCardGridBlock = ({
  title,
  intro,
  columns,
  cards,
}: {
  title?: string;
  intro?: string | string[];
  columns?: 'one' | 'two' | 'three';
  cards: Array<{
    title: string;
    badge?: string;
    body?: Array<RichTextNode> | string | string[];
    ctas?: CTA[];
    variant?: 'static' | 'flightPlans' | 'logs' | 'links';
    config?: {
      limit?: number;
      minRole?: string;
      emptyLabel?: string;
    };
  }>;
}): PageBlock => ({
  blockType: 'cardGrid',
  title: title ?? null,
  intro: intro ? richText(...paragraphs(...toArray(intro))) : [],
  columns: columns ?? 'three',
  cards: cards.map((card) => {
    const configEntries = Object.entries(card.config ?? {}).filter(
      ([, value]) => value != null && value !== '',
    );

    const mapped: Record<string, unknown> = {
      variant: card.variant ?? 'static',
      badge: card.badge ?? null,
      title: card.title,
      body:
        card.body && Array.isArray(card.body)
          ? card.body
          : card.body
            ? richText(...paragraphs(...toArray(card.body as string | string[])))
            : [],
      ctas: (card.ctas ?? [])
        .filter((cta) => Boolean(cta?.label && cta?.href))
        .map((cta) => ({
          label: cta.label,
          href: cta.href,
          style: cta.style ?? 'primary',
        })),
    };

    if (configEntries.length > 0) {
      mapped.config = Object.fromEntries(configEntries);
    }

    return mapped;
  }),
});

const makeCTAListBlock = ({
  title,
  intro,
  items,
}: {
  title: string;
  intro?: string | string[];
  items: Array<{
    title: string;
    description?: string | string[];
    cta?: CTA;
  }>;
}): PageBlock => {
  const mappedItems = items.map((item) => {
    const entry: Record<string, unknown> = {
      title: item.title,
      description: item.description
        ? richText(...paragraphs(...toArray(item.description)))
        : [],
    };
    if (item.cta?.label && item.cta?.href) {
      entry.cta = {
        label: item.cta.label,
        href: item.cta.href,
        style: item.cta.style ?? 'primary',
      };
    }
    return entry;
  });

  return {
    blockType: 'ctaList',
    title,
    intro: intro ? richText(...paragraphs(...toArray(intro))) : [],
    items: mappedItems,
  };
};

const makeTimelineBlock = ({
  title,
  intro,
  items,
}: {
  title: string;
  intro?: string | string[];
  items: Array<{
    heading: string;
    timestamp?: string;
    body: string | string[];
  }>;
}): PageBlock => ({
  blockType: 'timeline',
  title,
  intro: intro ? richText(...paragraphs(...toArray(intro))) : [],
  items: items.map((item) => ({
    heading: item.heading,
    timestamp: item.timestamp ?? null,
    body: richText(...paragraphs(...toArray(item.body))),
  })),
});

const makeStatGridBlock = ({
  title,
  intro,
  stats,
  ctas,
}: {
  title: string;
  intro?: string | string[];
  stats: Array<{ value: string; label: string }>;
  ctas?: CTA[];
}): PageBlock => ({
  blockType: 'statGrid',
  title,
  intro: intro ? richText(...paragraphs(...toArray(intro))) : [],
  stats,
  ctas: (ctas ?? []).map((cta) => ({
    label: cta.label,
    href: cta.href,
    style: cta.style ?? 'primary',
  })),
});

const makeCrewPreviewBlock = ({
  title,
  description,
  cta,
  minRole,
  limit,
}: {
  title: string;
  description?: string | string[];
  cta?: CTA;
  minRole?: string;
  limit?: number;
}): PageBlock => ({
  blockType: 'crewPreview',
  title,
  description: description ? richText(...paragraphs(...toArray(description))) : [],
  minRole: minRole ?? null,
  limit: limit ?? null,
  cta: cta
    ? {
        label: cta.label,
        href: cta.href,
        style: cta.style ?? 'primary',
      }
    : undefined,
});

const makeCrewRosterBlock = ({
  badge,
  title,
  description,
  mode,
  limit,
  ctas,
}: {
  badge?: string;
  title: string;
  description?: string | string[];
  mode?: 'preview' | 'full';
  limit?: number;
  ctas?: CTA[];
}): PageBlock => ({
  blockType: 'crewRoster',
  badge: badge ?? null,
  title,
  description: description ? richText(...paragraphs(...toArray(description))) : [],
  mode: mode ?? 'full',
  limit: limit ?? null,
  ctas: (ctas ?? []).map((cta) => ({
    label: cta.label,
    href: cta.href,
    style: cta.style ?? 'primary',
  })),
});

const makeNavigationModuleBlock = ({
  title,
  description,
  nodeId,
  path,
}: {
  title?: string;
  description?: string | string[];
  nodeId?: string;
  path?: string;
} = {}): PageBlock => ({
  blockType: 'navigationModule',
  title: title ?? null,
  description: description ? richText(...paragraphs(...toArray(description))) : [],
  nodeId: nodeId ?? null,
  path: path ?? null,
});

export const pageDefinitions: PageDefinition[] = [
  {
    title: 'Airlock - do you dare?',
    path: '/',
    summary: 'Welcome aboard! Did you ever think about becoming a pirate?',
    navigation: {
      nodeId: 'airlock',
      label: 'Airlock (home)',
      description: 'Return to the entry deck and choose your next stop.',
    },
  layout: [
    (() => {
      const hero = makeHeroBlock({
        title: 'Airlock',
        tagline:
          'Manifestating the next golden age of priacy!',
      });

      hero.body = richText(
        { type: 'h2', children: [text('"Pirates"!?!?')] },
        paragraph(
          'We stand for solidarity and self-direction. We question given structures and test alternatives. We share responsibility rather than concentrate power. Learning is a principle: experiment, seek feedback, iterate. Craft and trust beat titles and status. Transparency is the default.',
        ),
        { type: 'h3', children: [text('From the first Golden Age of Pirates, ...')] },
        {
          type: 'columns',
          children: [
            {
              type: 'column',
              children: [
                { type: 'h4', children: [text('...we adopt:')] },
                unorderedList([
                  'Fairness and solidarity',
                  'Roles and accountability based on skill and trust',
                  'Direct address, not stabbing-in-the-back',
                  'Transparent books and open processes',
                ]),
              ],
            },
            {
              type: 'column',
              children: [
                { type: 'h4', children: [text('...we reject:')] },
                unorderedList([
                  'Violence or intimidation',
                  'Exploitation or theft',
                  'Short-term profit over sustainability',
                  'Behind-the-back maneuvers',
                ]),
              ],
            },
          ],
        },
      );

      return hero;
    })(),
      makeCardGridBlock({
        columns: 'two',
        cards: [
          {
            variant: 'static',
            badge: 'Bridge',
            title: 'Get invoved and plot missions',
            body: [
              ...paragraphs(
                'Review the latest logbooks and flight plans before you set a new course.',
              ),
            ],
            ctas: [
              { label: 'Bridge', href: '/bridge', style: 'secondary' },
            ],
          },
          {
            variant: 'static',
            badge: 'Gangway',
            title: 'Take a tour around the ship',
            body: [
              ...paragraphs(
                'Step onto the gangway, explore the ship and learn more about the Astral Pirates.',
              ),
            ],
            ctas: [
              { label: 'Gangway', href: '/gangway', style: 'secondary' },
            ],
          },
        ],
      }),
    ],
    legacyPaths: ['airlock'],
  },
  {
    title: 'Bridge',
    path: 'bridge',
    summary: 'Mission intel, crew updates, and the latest logs direct from the bridge.',
    navigation: {
      nodeId: 'bridge',
      label: 'Bridge',
      description: 'Plot missions, monitor logs, and coordinate the crew.',
    },
  layout: [
    makeHeroBlock({
      title: 'Bridge',
      tagline:
        'We are a roaming crew of artists, builders, dancers, and dreamers co-creating immersive experiences that mix music, craft, and mischief across the galaxy.',
    }),
      makeCrewPreviewBlock({
        title: 'Gangway',
        description: [
          'Step onto the gangway to see who is on deck right now and launch into their profiles.',
        ],
        cta: { label: 'Gangway', href: '/gangway', style: 'secondary' },
        limit: 6,
      }),
      makeCardGridBlock({
        columns: 'two',
        cards: [
          {
            variant: 'flightPlans',
            title: 'Flight-plans',
            body: [
              ...paragraphs(
                'Become part of our adventures',
              ),
            ],
            ctas: [
              { label: 'See all flight plans', href: '/bridge/flight-plans', style: 'secondary' },
              {
                label: 'Host a stopover',
                href: 'mailto:flightcrew@astralpirates.com?subject=Host%20a%20Flight%20Plan',
                style: 'primary',
              },
            ],
            config: {
              limit: 3,
              minRole: 'master-at-arms',
              emptyLabel: 'The crew is plotting the next mission.',
            },
          },
          {
            variant: 'logs',
            title: 'Logbook',
            body: [
              ...paragraphs(
                'Read dispatches from the bridge, reflections on past voyages, and mission handovers.',
              ),
            ],
            ctas: [{ label: 'View all logs', href: '/bridge/logbook', style: 'secondary' }],
            config: {
              limit: 3,
              minRole: 'captain',
              emptyLabel: 'No logs available yet.',
            },
          },
        ],
      }),
      makeStatGridBlock({
        title: 'Why sail with us',
        stats: [
          { value: '7', label: 'Ports explored' },
          { value: '90+', label: 'Crew enlisted' },
          { value: '7', label: 'Events co-created' },
        ],
        ctas: [{ label: 'Join the Astral Pirates', href: '/gangway/about', style: 'primary' }],
      }),
    ],
  },
  {
    title: 'Gangway',
    path: 'gangway',
    summary: 'Meet the Astral Pirates crew and explore their quarters.',
    navigation: {
      nodeId: 'gangway',
      label: 'Gangway',
      description: 'Step onto the gangway and browse the active crew roster.',
    },
    layout: [
      makeHeroBlock({
        title: 'Gangway',
        tagline:
          'Take a walk around the spine of our ship.',
        ctas: [
          { label: 'Airlock', href: '/', style: 'secondary' },
          { label: 'Crew-quarters', href: '/gangway/crew-quarters', style: 'secondary' },
        ],
      }),
      makeCTAListBlock({
        title: 'Take a tour around our booty-full ship!',
        intro: 'Every feature below is fully wired: roles, invites, bones, backgrounds, styleguides, and collaboration flows are active today.',
        items: [
          {
            title: 'Role-aware crew roster',
            description: 'Bridge, engineer, passenger, and keeper roles all render with the correct access gates and roster ordering.',
            cta: { label: 'View role matrix', href: '/gangway/crew-quarters', style: 'secondary' },
          },
          {
            title: 'Persistent crew profiles',
            description: 'Identity cards, pronouns, badges, and bio grids load directly from Payload so any edit reflects live across the fleet.',
            cta: { label: 'Open crew profiles', href: '/gangway/cockpit', style: 'secondary' },
          },
          {
            title: 'Invite + enlist pipeline',
            description: 'Call-sign invitations, token validation, and enlist acceptance flows are bundled into a single CMS-backed checklist.',
            cta: { label: 'Send or redeem invites', href: '/gangway/crew-quarters/enlist', style: 'secondary' },
          },
          {
            title: 'Flight-plan collaboration',
            description: 'Missions include roster management, role-based editing, E.L.S.A. charges, and invitation toggles for organisers.',
            cta: { label: 'Manage missions', href: '/bridge/flight-plans', style: 'secondary' },
          },
          {
            title: 'Logbook publishing',
            description: 'Structured captain dispatches, status tags, and pagination run end-to-end through the CMS + Nuxt log detail views.',
            cta: { label: 'Read dispatches', href: '/bridge/logbook', style: 'secondary' },
          },
          {
            title: 'Ship-bones navigation overlay',
            description: 'The over-complicated bone menu maps every deck connection with hover previews, keyboard arrows, and CMS-driven labels.',
            cta: { label: 'Traverse the bones', href: '/gangway', style: 'secondary' },
          },
          {
            title: 'Starfield background system',
            description: 'Client-side Three.js scene honors background preferences, throttles on low-power hardware, and syncs with the bone map.',
            cta: { label: 'Toggle the background', href: '/gangway/engineering/bay', style: 'secondary' },
          },
                    {
            title: 'Inline page editor',
            description: 'Captains can pop open the floating drawer on any CMS-backed page to tweak copy, reorder blocks, and publish without leaving the site.',
            cta: { label: 'See edit controls', href: '/gangway', style: 'secondary' },
          },
          {
            title: 'Control deck roadmap',
            description: 'Engineering initiatives, blockers, and readiness tiers are editable in Payload and render via the Control page.',
            cta: { label: 'Review control deck', href: '/gangway/engineering/control', style: 'secondary' },
          },
          {
            title: 'Styleguide & flow recipes',
            description: 'The design-system bay documents every Ui* primitive and the bridge/crew flows they compose, so captains ship consistently.',
            cta: { label: 'Browse the styleguide', href: '/gangway/engineering/bay', style: 'secondary' },
          },
          {
            title: 'About & comms flows',
            description: 'Mission history, pirate governance, and Dock/Become-a-Creator contact forms all live in CMS blocks for instant edits.',
            cta: { label: 'Meet & message us', href: '/gangway/about/contact', style: 'secondary' },
          },
        ],
      }),
      makeCardGridBlock({
        columns: 'two',
        cards: [
          {
            variant: 'static',
            title: 'Crew quarter',
            body: [
              ...paragraphs(
                'Step into the crew quarter cloud to see the roster ordered by the latest watch shifts and hop into each profile.',
              ),
            ],
            ctas: [
              { label: 'View crew quarters', href: '/gangway/crew-quarters', style: 'secondary' },
            ],
          },
          {
            variant: 'static',
            title: 'Bridge',
            body: [
              ...paragraphs(
                'Hop back to the command deck to plot your next move across every station aboard the flotilla.',
              ),
            ],
            ctas: [{ label: 'Bridge', href: '/bridge', style: 'primary' }],
          },
          {
            variant: 'static',
            title: 'About',
            body: [
              ...paragraphs(
                'Learn about the Astral Pirates’, their misson, mindset, culture, and the crews who keep the flotilla sailing.',
              ),
            ],
            ctas: [{ label: 'About', href: '/gangway/about', style: 'secondary' }],
          },
        ],
      }),
    ],
  },
  {
    title: 'About',
    path: 'gangway/about',
    summary: 'Mission, culture, and collaboration practices aboard the Astral Pirates.',
    navigation: {
      nodeId: 'about',
      label: 'About',
      description: 'Learn how the Astral Pirates organise culture-building voyages.',
    },
  layout: [
    makeHeroBlock({
        title: 'About',
        tagline:
          'Astral Pirates is a decentralized flotilla of creators who stage immersive cultural experiences while supporting local communities and grassroots causes.',
        ctas: [
          { label: 'Airlock', href: '/', style: 'link' },
          { label: 'Contact', href: '/gangway/about/contact', style: 'secondary' },
        ],
      }),
      makeCardGridBlock({
        columns: 'one',
        cards: [
          {
            variant: 'static',
            title: 'Our mission',
            body: paragraphs(
              'We remix the spirit of the high seas with 21st-century collaboration. Every stop on our voyage is a chance to build safer, more creative spaces where people can share art, knowledge, food, and care. We prototype new social systems in temporary autonomous zones and bring our learnings back to port.',
            ),
          },
        ],
      }),
      makeCTAListBlock({
        title: 'Guiding coordinates',
        items: [
          {
            title: 'Playful rebellion',
            description: 'We challenge the status quo with joy—through spectacle, storytelling, and the unexpected.',
          },
          {
            title: 'Radical hospitality',
            description: 'Every pirate looks out for the crew. Access, safety, and consent are built into each mission plan.',
          },
          {
            title: 'Mutual thrival',
            description: 'We share tools, funds, and knowledge so that everyone involved leaves resourced and inspired.',
          },
        ],
      }),
      makeCardGridBlock({
        columns: 'one',
        cards: [
          {
            variant: 'static',
            badge: 'Crew culture',
            title: 'Life aboard pirate ships',
            body: paragraphs(
              'Explore how historic pirate crews organized roles, shared power, and sustained community on the open sea.',
            ),
            ctas: [{ label: 'Pirates', href: '/gangway/about/pirates', style: 'secondary' }],
          },
          {
            variant: 'static',
            badge: 'Contact',
            title: 'Signal the bridge',
            body: paragraphs(
              'Ready to collaborate or bring the flotilla to your port? Open the comms channel and reach the bridge crew.',
            ),
            ctas: [{ label: 'Contact the Astral Pirates', href: '/gangway/about/contact', style: 'secondary' }],
          },
        ],
      }),
      makeCTAListBlock({
        title: 'How to get involved',
        items: [
          {
            title: 'Dock',
            description: 'Invite the Astral Pirates to collaborate on your local festival or community hub.',
            cta: { label: 'Contact', href: '/gangway/about/contact', style: 'secondary' },
          },
          {
            title: 'Become a greator',
            description: 'Help weld sculptures, sew costumes, or wire lighting rigs.',
            cta: { label: 'Flight-plans', href: '/bridge/flight-plans', style: 'secondary' },
          },
        ],
      }),
    ],
    legacyPaths: ['about'],
  },
  {
    title: 'Legal',
    path: 'gangway/legal',
    summary: 'Terms, privacy, and the policies that govern life aboard the Astral Pirates.',
    navigation: {
      nodeId: 'legal',
      label: 'Legal',
      description: 'Terms and privacy for the Astral Pirates.',
    },
    layout: [
      makeHeroBlock({
        title: 'Legal',
        tagline:
          'Short-form guidance on the ship’s terms, privacy posture, and the documents that protect the crew.',
        ctas: [
          { label: 'Back to gangway', href: '/gangway', style: 'secondary' },
          { label: 'Contact', href: '/gangway/about/contact', style: 'link' },
        ],
      }),
      makeCTAListBlock({
        title: 'Terms & Privacy',
        intro:
          'Review the official Terms & Privacy PDF before joining the crew or launching a mission.',
        items: [
          {
            title: 'Terms & Privacy PDF',
            description:
              'The official legal terms covering participation, conduct, and privacy handling.',
            cta: {
              label: 'Open PDF',
              href: '/legal/Astralpirates_Terms_Privacy.pdf',
              style: 'primary',
            },
          },
          {
            title: 'Questions or concerns',
            description:
              'Need clarification? Reach the bridge crew for help interpreting any section.',
            cta: { label: 'Contact the crew', href: '/gangway/about/contact', style: 'secondary' },
          },
        ],
      }),
    ],
  },
  {
    title: 'Pirates',
    path: 'gangway/about/pirates',
    summary: 'Historic pirate governance and how crews balanced power, risk, and reward.',
    navigation: {
      nodeId: 'pirates',
      label: 'Pirates',
      description: 'Study pirate organization and communal governance at sea.',
    },
  layout: [
    makeHeroBlock({
        title: 'Pirates',
        tagline:
          'Pirates are often remembered as raiders who thrived in chaos, yet their ships reveal something very different. Beneath the image of violence stood structured communities with clear roles, elected officers, and written rules. This organization ensured survival in a hostile world, where every voyage balanced on cooperation as much as plunder.',
        ctas: [
          { label: 'Return to about deck', href: '/gangway/about', style: 'secondary' },
          { label: 'Contact the crew', href: '/gangway/about/contact', style: 'link' },
        ],
      }),
      makeCTAListBlock({
        title: 'Roles on board',
        items: [
          ['Captain', 'Directed the ship in combat and during pursuits, valued for bravery, skill, and charisma.'],
          ['Quartermaster', 'Guardian of fairness, controlling provisions, discipline, and the execution of decisions.'],
          ['Boatswain (Bosun)', 'Oversaw sails, rigging, anchors, and deck work, ensuring the ship remained seaworthy.'],
          ['Gunner', 'Managed cannons, powder, and shot; trained the crew in handling artillery.'],
          [
            'Sailing master',
            'Navigator guiding the ship’s course, often spared from combat to preserve expertise.',
          ],
          ['Carpenter', 'Repaired hulls, masts, and structural damage, especially after battle.'],
          ['Surgeon', 'Treated wounds and illness aboard ship; rare and prized.'],
          ['Cook', 'Maintained food supplies and rationing, often combining the role with other duties.'],
          ['Musician', 'Provided rhythm for work and morale during leisure when crews had one.'],
          [
            'Common sailors and fighters',
            'Worked rigging, manned small arms, and boarded prizes—the majority of the crew.',
          ],
        ].map(([title, description]) => ({
          title,
          description,
        })),
      }),
      makeCardGridBlock({
        columns: 'one',
        cards: [
          {
            variant: 'static',
            title: 'Power and balance',
            body: paragraphs(
              'Pirate society rejected the rigid hierarchy of navies. Captains held temporary authority in battle, when hesitation could mean death, but outside combat they were one voice among many. Quartermasters provided the counterweight, managing discipline and supplies, and leading day-to-day affairs.',
              'Specialists like sailing masters, carpenters, and surgeons commanded respect through skill rather than rank. Their voices carried weight because the crew could not function without them, yet they remained equals politically. Even the newest sailor had a vote.',
              'This balance created a distributed system of authority. Power was shared horizontally rather than stacked vertically. Routes, targets, or leadership decisions were made in assemblies where every member had an equal say.',
            ),
          },
          {
            variant: 'static',
            title: 'Articles and law',
            body: paragraphs(
              'Every voyage began with the drafting of articles, written agreements that served as constitutions. They laid out how treasure would be divided, with slight differences for roles but never large disparities. They set punishments for theft, desertion, or cowardice, and guaranteed compensation for injury.',
              'The articles legitimized power by securing consent in advance. They turned a band of outlaws into a functioning, self-governing society.',
            ),
          },
          {
            variant: 'static',
            title: 'Conflict and cohesion',
            body: paragraphs(
              'Disputes were handled through arbitration by officers or, if necessary, crew votes. In extreme cases, controlled duels ashore settled matters without risking the ship’s unity.',
              'The system was less about suppressing quarrels than about preventing them from shattering the fragile social order on which survival depended.',
            ),
          },
          {
            variant: 'static',
            title: 'Wealth and security',
            body: paragraphs(
              'Treasure was shared openly, counted in sight of the entire crew. The captain’s extra share was modest, reflecting combat risk but not placing them far above others. Specialists might receive slightly more, but the system remained broadly egalitarian.',
              'Transparency reduced envy, fostered loyalty, and distinguished pirate ships from the inequality of merchant and naval vessels.',
            ),
          },
          {
            variant: 'static',
            title: 'Organization at sea',
            body: paragraphs(
              'Taken together, the roles, balance of power, and written laws formed a distinctive maritime order. Pirates lived by plunder, yet they built functioning communities where authority was temporary, rules were shared, and fairness bound crews together.',
            ),
          },
        ],
      }),
      makeCTAListBlock({
        title: 'Sources',
        items: [
          {
            title: 'Marcus Rediker',
            description: 'Villains of All Nations: Atlantic Pirates in the Golden Age (Beacon Press, 2004).',
          },
          {
            title: 'Peter T. Leeson',
            description: 'The Invisible Hook: The Hidden Economics of Pirates (Princeton University Press, 2009).',
          },
          {
            title: 'Charles Johnson',
            description:
              'A General History of the Pyrates (1724). Read via Project Gutenberg: https://www.gutenberg.org/ebooks/40580',
          },
          {
            title: 'David Cordingly',
            description: 'Under the Black Flag: The Romance and the Reality of Life Among the Pirates (Random House, 1996).',
          },
        ],
      }),
    ],
    legacyPaths: ['about/pirates'],
  },
  {
    title: 'Crew quarters',
    path: 'gangway/crew-quarters',
    summary: 'A living roster ordered by who has been most active on board.',
    navigation: {
      nodeId: 'crew',
      label: 'Crew-quarters',
      description: 'Meet the pirates currently on watch.',
    },
    layout: [
      makeHeroBlock({
        eyebrow: 'Crew activity',
        title: 'Crew quarters',
        tagline: [
          'Drift through the crew cloud to see who just finished a watch and who is suiting up for the next mission.',
        ],
        body: [
          'The live roster below updates automatically as pirates publish logs, refresh their briefs, or join flight plans. Click any avatar to open the full crew profile.',
        ],
        ctas: [
          { label: 'Return to the gangway', href: '/gangway', style: 'secondary' },
          { label: 'Back to the airlock', href: '/', style: 'link' },
        ],
      }),
      makeCrewRosterBlock({
        badge: 'Activity cloud',
        title: 'Live crew roster',
        description: [
          'Online crew rise to the top. Share this view with captains coordinating shifts or onboarding new pirates.',
        ],
        mode: 'full',
        limit: 12,
        ctas: [
          { label: 'Browse flight plans', href: '/bridge/flight-plans', style: 'secondary' },
          {
            label: 'Signal flight crew',
            href: 'mailto:flightcrew@astralpirates.com?subject=Join%20a%20flight%20plan',
            style: 'primary',
          },
        ],
      }),
    ],
  },
  {
    title: 'The lair',
    path: 'gangway/lair',
    summary: 'E.L.S.A. explainer with balance tips, spend rules, and refuel paths.',
    navigation: {
      nodeId: 'lair',
      label: 'Lair',
      description: 'E.L.S.A. balance, spends, and refills.',
    },
    layout: [
      makeHeroBlock({
        eyebrow: 'E.L.S.A. tokens',
        title: 'Lair',
        tagline: [
          'Keep your E.L.S.A. balance in view, understand where tokens go, and learn how to refill before you launch a mission or recruit.',
        ],
        body: [
          'These credits fuel crew growth and mission prep. Track your balance below and jump into the crew quarters or your profile to act on it.',
        ],
        ctas: [
          { label: 'Crew quarters', href: '/gangway/crew-quarters', style: 'secondary' },
          { label: 'View your profile', href: '/gangway/cockpit', style: 'primary' },
        ],
      }),
      makeStatGridBlock({
        title: 'What E.L.S.A. tokens do',
        intro: [
          'Existing crew actions that spend tokens and the automatic refills that keep you stocked.',
        ],
        stats: [
          { value: '1 token', label: 'Spend to invite a new recruit' },
          { value: '1 token', label: 'Spend to chart a new flight plan' },
          { value: 'Up to 10', label: 'Weekly top-up for captains (crew get at least 1)' },
        ],
        ctas: [
          { label: 'Send an invite', href: '/gangway/crew-quarters/enlist', style: 'primary' },
          { label: 'Browse flight plans', href: '/bridge/flight-plans', style: 'secondary' },
        ],
      }),
      makeCardGridBlock({
        columns: 'two',
        cards: [
          {
            badge: 'Spend',
            title: 'Where tokens are used',
            body: paragraphs(
              'Invite recruits: every enlistment spends 1 E.L.S.A. from your reserves.',
              'Flight plan creation: captains and eligible crew spend 1 E.L.S.A. to chart a mission.',
              'Cancelled recruit invites refund the token automatically.',
            ),
            ctas: [{ label: 'Open crew quarters', href: '/gangway/crew-quarters', style: 'secondary' }],
          },
          {
            badge: 'Get more',
            title: 'How to refill',
            body: paragraphs(
              'Starter grants: captain-led invites seed new pirates with tokens on registration.',
              'Weekly top-ups: captains climb to 10 tokens; crew climb to at least 1.',
              'Rewards and refunds: certain flows (tests, invite cancellations) restore tokens when eligible.',
            ),
            ctas: [{ label: 'View your profile', href: '/gangway/cockpit', style: 'secondary' }],
          },
        ],
      }),
      makeCTAListBlock({
        title: 'Do more with E.L.S.A.',
        intro: 'Use these quick actions to manage your balance without leaving the gangway.',
        items: [
          {
            title: 'Check your balance',
            description: 'Your balance pill stays visible when you are logged in.',
            cta: { label: 'Jump to the lair', href: '/gangway/lair', style: 'link' },
          },
          {
            title: 'Invite a recruit',
            description: 'Spend a token to send a crew-ready enlistment link.',
            cta: { label: 'Send an invite', href: '/gangway/crew-quarters/enlist', style: 'primary' },
          },
          {
            title: 'Review your profile',
            description: 'Keep call sign and avatar current so invites feel personal.',
            cta: { label: 'View profile', href: '/gangway/cockpit', style: 'secondary' },
          },
        ],
      }),
    ],
  },
  {
    title: 'Engineering',
    path: 'gangway/engineering',
    summary: 'Systems lab where the crew tracks tooling, experiments, and roadmaps.',
    navigation: {
      nodeId: 'engineering',
      label: 'Engineering',
      description: 'Peek inside the shipyard and tooling lockers.',
    },
    layout: [
      makeHeroBlock({
        eyebrow: 'Ship systems',
        title: 'Engineering deck',
        tagline: [
          'Mission control, tooling manifests, and the bay where we prototype interface systems before launch.',
        ],
        body: [
          'Use the callouts below to jump into the live roadmap (Control) or skim the design-system inventory (Engineering Bay).',
        ],
        ctas: [
          { label: 'Open Control', href: '/gangway/engineering/control', style: 'secondary' },
          { label: 'Visit the Bay', href: '/gangway/engineering/bay', style: 'primary' },
        ],
      }),
      makeNavigationModuleBlock({
        title: 'Connected decks',
        description: [
          'Buttons stay in sync with the ship layout schema, so updates to the navigation tree automatically flow here.',
        ],
        nodeId: 'engineering',
      }),
      makeCTAListBlock({
        title: 'Tools on our deck',
        items: [
          ['Nuxt 3 + Vue 3', 'Frontend shell powering the live site and overlays.'],
          ['Payload CMS', 'Hosts structured content, crew briefs, and log data.'],
          ['pnpm + Vite', 'Tooling stack for rapid development builds.'],
          ['Three.js', 'Handles the interactive starfield and 3D flourishes.'],
          ['Docker Compose', 'Keeps local services and CI parity in sync.'],
          ['Terraform', 'Codifies our Hetzner infrastructure and secrets.'],
          ['Hetzner Cloud', 'Runs the production fleet with hardened defaults.'],
          ['Nginx', 'Edge router for TLS, caching, and proxying.'],
          ['PostgreSQL', 'Primary store for Payload content and crew state.'],
          ['Redis', 'Queues and caching layer for missions plus invites.'],
          [
            'SeaweedFS',
            'Distributed file system for blob/object-style storage and replication. Git repo: https://github.com/seaweedfs/seaweedfs',
          ],
        ].map(([title, description]) => ({
          title,
          description,
        })),
      }),
    ],
  },
  {
    title: 'Mission Control',
    path: 'gangway/engineering/control',
    summary: 'Live roadmap and rollout queue for bridge-facing initiatives.',
    navigation: {
      nodeId: 'control',
      label: 'Control',
      description: 'Monitor the bridge roadmap and critical fixes.',
    },
    layout: [
      makeHeroBlock({
        eyebrow: 'Roadmap lounge',
        title: 'Mission Control',
        tagline: [
          'Served from the CMS roadmap tiers seeded from docs/planning/roadmap-priorities.md with a bundled fallback.',
        ],
        body: [
          'Use the navigation module below to move between bridge, engineering, and bay contexts without leaving the deck.',
        ],
        ctas: [
          {
            label: 'Open roadmap doc',
            href: 'https://github.com/astralpirates/astralpirates.com/blob/main/docs/planning/roadmap-priorities.md',
            style: 'secondary',
          },
        ],
      }),
      makeNavigationModuleBlock({
        title: 'Ship layout routes',
        description: ['Connected routes appear automatically; leaves fall back to their parent deck.'],
        nodeId: 'control',
      }),
    ],
  },
  {
    title: 'Engineering Bay',
    path: 'gangway/engineering/bay',
    summary: 'Design-system manifest plus demo shortcuts for UI work.',
    navigation: {
      nodeId: 'bay',
      label: 'Bay',
      description: 'Design system manifest and tooling links.',
    },
    layout: [
      makeHeroBlock({
        eyebrow: 'Interface lab',
        title: 'Engineering Bay',
        tagline: ['Skim every component demo without loading the heavy clones.'],
        body: [
          'This page mirrors the design-system registry and links straight into the Nuxt demos for quick QA.',
        ],
      }),
      makeNavigationModuleBlock({
        title: 'Deck links',
        description: ['Prefer quick jumps? Use these to hop to Mission Control or back to Gangway.'],
        nodeId: 'bay',
      }),
    ],
  },
];

export type PageBlockDefinition = (typeof pageDefinitions)[number]['layout'][number] & Block;
