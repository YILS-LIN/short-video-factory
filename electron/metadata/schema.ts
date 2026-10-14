import { compare as compareSemver, valid as isValidSemver, validRange } from 'semver'
import { z } from 'zod'

const ChannelSchema = z.enum(['stable', 'beta', 'nightly'])
const PlatformSchema = z.enum(['windows', 'macos', 'linux', 'android', 'ios', 'web'])
const ArchitectureSchema = z.enum(['x64', 'arm64', 'x86', 'universal'])
const LocaleSchema = z
  .string()
  .min(2)
  .max(35)
  .refine((value) => {
    try {
      const locales = Intl.getCanonicalLocales(value)
      return locales.length === 1 && locales[0] === value
    } catch {
      return false
    }
  })
const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch {
      return false
    }
  }, 'Only credential-free HTTPS URLs are allowed')
const UtcDateTimeSchema = z.string().refine((value) => {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}, 'Expected a UTC ISO-8601 date-time')
const SemVerSchema = z.string().refine((value) => isValidSemver(value) === value, 'Invalid SemVer')
const NoticeSeveritySchema = z.enum(['info', 'success', 'warning', 'critical'])

const AppSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    longDescription: z.string().max(10000).optional(),
    authorId: z.string().min(1).max(100),
    homepage: HttpsUrlSchema.optional(),
    repository: HttpsUrlSchema.optional(),
    docs: HttpsUrlSchema.optional(),
    issues: HttpsUrlSchema.optional(),
    support: HttpsUrlSchema.optional(),
    license: z.string().min(1).max(100).optional(),
    status: z.enum(['active', 'maintenance', 'deprecated', 'eol', 'archived']),
    defaultChannel: ChannelSchema,
    platforms: z.array(PlatformSchema).min(1),
    createdAt: UtcDateTimeSchema.optional(),
    updatedAt: UtcDateTimeSchema,
    deprecatedAt: UtcDateTimeSchema.optional(),
    eolAt: UtcDateTimeSchema.optional(),
    replacement: z.string().min(1).max(120).optional(),
    migrationUrl: HttpsUrlSchema.optional(),
    manifestRevision: z.number().int().positive().safe(),
  })
  .strict()

const AssetSchema = z
  .object({
    platform: PlatformSchema,
    arch: ArchitectureSchema,
    url: HttpsUrlSchema,
    mirrors: z.array(HttpsUrlSchema).optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().positive().safe(),
  })
  .strict()

const ReleaseSchema = z
  .object({
    version: SemVerSchema,
    channel: ChannelSchema,
    publishedAt: UtcDateTimeSchema,
    releaseNotes: z.string().max(20000),
    releaseNotesTranslations: z.record(LocaleSchema, z.string().max(20000)).optional(),
    minSupportedVersion: SemVerSchema.optional(),
    forceUpdate: z.boolean().default(false),
    assets: z.array(AssetSchema),
  })
  .strict()
  .superRefine((release, context) => {
    if (
      release.minSupportedVersion &&
      compareSemver(release.minSupportedVersion, release.version) > 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['minSupportedVersion'],
        message: 'Minimum supported version cannot exceed the release version.',
      })
    }
  })

const NoticeTargetSchema = z
  .object({
    versionRange: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => validRange(value) !== null)
      .optional(),
    platforms: z.array(PlatformSchema).min(1).optional(),
    architectures: z.array(ArchitectureSchema).min(1).optional(),
    channels: z.array(ChannelSchema).min(1).optional(),
    distributionChannels: z.array(z.string().min(1).max(80)).min(1).optional(),
    requiredCapabilities: z.array(z.string().min(1).max(100)).min(1).optional(),
  })
  .passthrough()

const NoticeActionSchema = z
  .object({
    type: z.literal('external-link'),
    label: z.string().min(1).max(80),
    url: HttpsUrlSchema,
  })
  .strict()

const NoticeTranslationSchema = z
  .object({
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(500),
    bodyMarkdown: z.string().min(1).max(12000),
    actions: z.array(NoticeActionSchema).max(3).default([]),
  })
  .strict()

const NoticeSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    revision: z.number().int().positive().safe(),
    kind: z.enum(['general', 'service', 'security', 'migration']),
    severity: z.enum(['info', 'success', 'warning', 'critical']),
    priority: z.number().int().min(0).max(1000).default(0),
    publishedAt: UtcDateTimeSchema,
    startsAt: UtcDateTimeSchema.optional(),
    expiresAt: UtcDateTimeSchema.optional(),
    dismissible: z.boolean().default(true),
    defaultLocale: LocaleSchema,
    translations: z.record(LocaleSchema, NoticeTranslationSchema),
    targets: NoticeTargetSchema.optional(),
  })
  .passthrough()
  .superRefine((notice, context) => {
    if (!Object.prototype.hasOwnProperty.call(notice.translations, notice.defaultLocale)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultLocale'],
        message: 'Notice defaultLocale must exist in translations.',
      })
    }
    if (
      notice.startsAt &&
      notice.expiresAt &&
      Date.parse(notice.startsAt) >= Date.parse(notice.expiresAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Notice expiresAt must be after startsAt.',
      })
    }
  })

const UpdateNotesTranslationSchema = z
  .object({
    title: z.string().min(1).max(160),
    bodyMarkdown: z.string().min(1).max(20000),
  })
  .strict()

const UpdateNotesOverrideSchema = z
  .object({
    versionRange: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => validRange(value) !== null),
    mode: z.enum(['prepend', 'replace']),
    severity: NoticeSeveritySchema,
    defaultLocale: LocaleSchema,
    translations: z
      .record(LocaleSchema, UpdateNotesTranslationSchema)
      .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 8),
  })
  .strict()
  .superRefine((notesOverride, context) => {
    if (
      !Object.prototype.hasOwnProperty.call(notesOverride.translations, notesOverride.defaultLocale)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['defaultLocale'],
        message: 'Update notes defaultLocale must exist in translations.',
      })
    }
  })

const UpdatePolicySchema = z
  .object({
    minSupportedVersion: SemVerSchema.optional(),
    notesOverride: UpdateNotesOverrideSchema.optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!policy.minSupportedVersion && !policy.notesOverride) {
      context.addIssue({
        code: 'custom',
        message: 'Update policy must configure a minimum version or a notes override.',
      })
    }
  })

const TipSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().min(1).max(160),
    content: z.string().min(1).max(4000),
    url: HttpsUrlSchema.optional(),
    priority: z.number().int().min(0).max(1000).default(0),
    startsAt: UtcDateTimeSchema.optional(),
    expiresAt: UtcDateTimeSchema.optional(),
    targets: NoticeTargetSchema.optional(),
  })
  .strict()

const AuthorSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(120),
    displayName: z.string().min(1).max(120),
    avatar: HttpsUrlSchema.optional(),
    bio: z.string().max(2000).optional(),
    homepage: HttpsUrlSchema.optional(),
    github: HttpsUrlSchema.optional(),
    email: z.email().optional(),
    social: z.record(z.string(), HttpsUrlSchema).optional(),
    sponsor: HttpsUrlSchema.optional(),
  })
  .strict()

const CommercialPlanSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(100),
    priceMinor: z.number().int().nonnegative().safe(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    billing: z.enum(['one_time', 'monthly', 'yearly']),
    purchaseUrl: HttpsUrlSchema.optional(),
  })
  .strict()

const CommercialSchema = z
  .object({
    enabled: z.boolean(),
    plans: z.array(CommercialPlanSchema),
    sponsorUrl: HttpsUrlSchema.optional(),
    licenseTerms: z.string().max(4000).optional(),
    contactEmail: z.email().optional(),
  })
  .strict()

const RemoteConfigSchema = z
  .object({
    features: z.record(z.string(), z.boolean()),
    limits: z.record(z.string(), z.number().finite().min(0).max(1_000_000)),
    endpoints: z.record(z.string(), HttpsUrlSchema),
  })
  .strict()

export const ManifestEnvelopeSchema = z
  .object({
    payload: z.unknown(),
    signature: z
      .object({
        alg: z.literal('Ed25519'),
        keyId: z.string().min(1).max(100),
        value: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
      })
      .strict(),
  })
  .strict()

export const ManifestPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().positive().safe(),
    channel: ChannelSchema,
    app: AppSchema,
    release: ReleaseSchema.nullable(),
    updatePolicy: UpdatePolicySchema.nullable().optional(),
    notices: z.array(NoticeSchema).max(100),
    tips: z.array(TipSchema).max(100),
    remoteConfig: RemoteConfigSchema,
    commercial: CommercialSchema,
    author: AuthorSchema,
  })
  .strict()

export type ManifestPayload = z.infer<typeof ManifestPayloadSchema>
export type Notice = ManifestPayload['notices'][number]
export type NoticeTranslation = Notice['translations'][string]
export type Release = NonNullable<ManifestPayload['release']>
export type UpdatePolicy = NonNullable<ManifestPayload['updatePolicy']>
export type UpdateNotesOverride = NonNullable<UpdatePolicy['notesOverride']>
