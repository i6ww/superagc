type VersionWithId = {
  id: string;
};

type VersionedRecord<TKey extends string, TVersion> = {
  activeVersionId?: string;
} & Partial<Record<TKey, TVersion[]>>;

export const DEFAULT_ORIGINAL_VERSION_ID = 'original';

export function appendVersionToRecord<
  TVersion extends VersionWithId,
  TKey extends string,
  TRecord extends VersionedRecord<TKey, TVersion>,
  TPatch extends object,
>(
  record: TRecord,
  versionsKey: TKey,
  version: TVersion,
  maxVersions: number,
  statePatch: TPatch
): Partial<TRecord> & TPatch {
  const versions = [version, ...((record[versionsKey] || []) as TVersion[])].slice(0, maxVersions);

  return {
    [versionsKey]: versions,
    activeVersionId: version.id,
    ...statePatch,
  } as Partial<TRecord> & TPatch;
}

export function switchVersionInRecord<
  TVersion extends VersionWithId,
  TKey extends string,
  TRecord extends VersionedRecord<TKey, TVersion>,
  TPatch extends object,
>(
  record: TRecord,
  versionsKey: TKey,
  versionId: string,
  options: {
    getVersionPatch: (version: TVersion) => TPatch;
    getOriginalPatch?: (record: TRecord) => TPatch | null;
    originalVersionId?: string;
  }
): (Partial<TRecord> & TPatch) | null {
  const originalVersionId = options.originalVersionId || DEFAULT_ORIGINAL_VERSION_ID;
  if (versionId === originalVersionId) {
    const originalPatch = options.getOriginalPatch?.(record);
    return originalPatch
      ? ({
          activeVersionId: originalVersionId,
          ...originalPatch,
        } as Partial<TRecord> & TPatch)
      : null;
  }

  const version = ((record[versionsKey] || []) as TVersion[]).find((item) => item.id === versionId);
  if (!version) {
    return null;
  }

  return {
    activeVersionId: versionId,
    ...options.getVersionPatch(version),
  } as Partial<TRecord> & TPatch;
}
