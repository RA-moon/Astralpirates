(function () {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return;
  }

  var guardKey = 'nuxt-chunk-refresh';
  var markerValue = '1';

  try {
    var storage = window.sessionStorage;
    if (storage && storage.getItem(guardKey) === markerValue) {
      window.location.reload();
      return;
    }
    if (storage) {
      storage.setItem(guardKey, markerValue);
    }
  } catch (err) {
    // ignore storage failures and fall back to location reload logic
  }

  try {
    var url = new URL(window.location.href);
    if (!url.searchParams.has('_nuxt_refresh')) {
      url.searchParams.set('_nuxt_refresh', Date.now().toString(36));
      window.location.replace(url.toString());
      return;
    }
  } catch (err) {
    // ignore URL reconstruction errors, fall through to full reload
  }

  window.location.reload();
})();
