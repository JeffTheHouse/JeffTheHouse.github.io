const KATAKANA =
  'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMS = '0123456789';
const ALPHABET = KATAKANA + LATIN + NUMS;

/**
 * Initialize a responsive Matrix digital rain animation on a <canvas>.
 * @param {string} canvasId
 * @param {object} [options]
 * @param {string} [options.color='#00ff41']
 * @param {number} [options.fontSize=13]
 * @param {number} [options.intervalMs=35]
 * @param {number} [options.fadeAlpha=0.05]
 * @param {number} [options.opacity=0.4]
 */
export function initMatrixRain(canvasId = 'Matrix', options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const {
    color = '#00ff41',
    fontSize = 13,
    intervalMs = 35,
    fadeAlpha = 0.05,
    opacity = 0.4,
  } = options;

  canvas.style.opacity = String(opacity);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let columns = 0;
  let rainDrops = [];

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.ceil(canvas.width / fontSize);
    rainDrops = Array.from({ length: columns }, () =>
      Math.floor(Math.random() * (canvas.height / fontSize))
    );
  };

  resize();
  window.addEventListener('resize', resize);

  const draw = () => {
    ctx.fillStyle = `rgba(5, 8, 7, ${fadeAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = color;
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < rainDrops.length; i++) {
      const char = ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
      ctx.fillText(char, i * fontSize, rainDrops[i] * fontSize);

      if (rainDrops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        rainDrops[i] = 0;
      }
      rainDrops[i]++;
    }
  };

  // Respect prefers-reduced-motion: draw a single static frame instead of looping
  const prefersReduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    draw();
    return () => window.removeEventListener('resize', resize);
  }

  const timerId = window.setInterval(draw, intervalMs);

  return () => {
    window.clearInterval(timerId);
    window.removeEventListener('resize', resize);
  };
}
