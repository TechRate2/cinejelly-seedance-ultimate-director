/**
 * Browser-side runtime script embedded into the generated HTML.
 * Implements window.__hf.seek(t) and effect application.
 * Kept as a string template so it can be embedded inline without a bundler.
 */

export const RUNTIME_SCRIPT = `
(function () {
  var CLIPS = /*CLIPS_JSON*/[];

  function interpolate(kfs, t) {
    if (!kfs || kfs.length === 0) return null;
    if (kfs.length === 1) return kfs[0].values;
    var prev = kfs[0], next = kfs[kfs.length - 1];
    for (var i = 0; i < kfs.length - 1; i++) {
      if (t >= kfs[i].time && t <= kfs[i + 1].time) { prev = kfs[i]; next = kfs[i + 1]; break; }
    }
    if (t <= prev.time) return prev.values;
    if (t >= next.time) return next.values;
    var raw = (t - prev.time) / (next.time - prev.time);
    var e = prev.easing || 'linear';
    var p = e === 'easeIn' ? raw * raw
           : e === 'easeOut' ? raw * (2 - raw)
           : e === 'easeInOut' ? (raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw)
           : raw;
    var out = {};
    for (var k in prev.values) {
      var a = +prev.values[k], b = +next.values[k];
      out[k] = isNaN(a) || isNaN(b) ? prev.values[k] : a + (b - a) * p;
    }
    return out;
  }

  function applyEffects(el, effects, clipTime) {
    var opacity = 1;
    var filters = [];
    for (var i = 0; i < effects.length; i++) {
      var fx = effects[i];
      var t = clipTime - fx.startTime;
      if (t < 0 || t > fx.duration) continue;
      var vals = (fx.keyframes && fx.keyframes.length > 0)
        ? interpolate(fx.keyframes, t)
        : fx.params;
      if (!vals) continue;
      switch (fx.type) {
        case 'fadeIn':
          opacity = Math.min(opacity, t / fx.duration * (+(vals.intensity || 1))); break;
        case 'fadeOut':
          opacity = Math.min(opacity, (1 - t / fx.duration) * (+(vals.intensity || 1))); break;
        case 'blur':
          filters.push('blur(' + (+vals.radius || 0) + 'px)'); break;
        case 'brightness':
          filters.push('brightness(' + (+vals.value || 1) + ')'); break;
        case 'contrast':
          filters.push('contrast(' + (+vals.value || 1) + ')'); break;
        case 'saturation':
          filters.push('saturate(' + (+vals.value || 1) + ')'); break;
      }
    }
    el.style.opacity = String(opacity);
    if (filters.length > 0) el.style.filter = filters.join(' ');
    else el.style.filter = '';
  }

  window.__hf = {
    duration: /*DURATION*/0,
    media: /*MEDIA_JSON*/[],
    seek: function (t) {
      for (var i = 0; i < CLIPS.length; i++) {
        var c = CLIPS[i];
        var el = document.getElementById(c.id);
        if (!el) continue;
        var active = t >= c.startTime && t < c.startTime + c.duration;
        el.style.display = active ? 'block' : 'none';
        if (active) applyEffects(el, c.effects, t - c.startTime);
      }
    }
  };
})();
`;
