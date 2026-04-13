(function () {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return;
  }

  var guardKey = 'nuxt-chunk-refresh-DV-ObPvH';

  try {
    var storage = window.sessionStorage;
    if (storage && storage.getItem(guardKey) === '1') {
      window.location.reload();
      return;
    }
    if (storage) {
      storage.setItem(guardKey, '1');
    }
  } catch (err) {
    // ignore storage failures
  }

  try {
    var url = new URL(window.location.href);
    url.searchParams.set('_nuxt_refresh', Date.now().toString(36));
    window.location.replace(url.toString());
    return;
  } catch (err) {
    // ignore URL parsing problems
  }

  window.location.reload();
})();
