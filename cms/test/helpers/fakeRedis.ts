type Entry = {
  value: string | number;
  expiresAt: number | null;
};

const now = () => Date.now();

export class FakeRedis {
  private store = new Map<string, Entry>();

  clear() {
    this.store.clear();
  }

  private getEntry(key: string): Entry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= now()) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  async incr(key: string): Promise<number> {
    const entry = this.getEntry(key);
    const current = entry ? Number(entry.value) : 0;
    const next = current + 1;
    const expiresAt = entry?.expiresAt ?? null;
    this.store.set(key, { value: next, expiresAt });
    return next;
  }

  async pexpire(key: string, ttl: number): Promise<number> {
    const entry = this.getEntry(key);
    if (!entry) return 0;
    entry.expiresAt = now() + ttl;
    this.store.set(key, entry);
    return 1;
  }

  async pttl(key: string): Promise<number> {
    const entry = this.getEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt == null) return -1;
    const remaining = entry.expiresAt - now();
    if (remaining <= 0) {
      this.store.delete(key);
      return -2;
    }
    return Math.ceil(remaining);
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    keys.forEach((key) => {
      if (this.store.delete(key)) {
        removed += 1;
      }
    });
    return removed;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.getEntry(key);
    if (!entry) return null;
    return String(entry.value);
  }

  async set(key: string, value: string, mode?: string, _modifier?: string, ttl?: number): Promise<'OK'> {
    let expiresAt: number | null = null;
    if (mode === 'PX' && typeof ttl === 'number') {
      expiresAt = now() + ttl;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }
}
