import { useEffect, useRef } from 'react';

const logoPaths = [
  '/logo/ethereum.png',
  '/logo/optimism.png',
  '/logo/bnb.png',
  '/logo/polygon.png',
  '/logo/arbitrum.png',
  '/logo/base.png',
  '/logo/unichain.png',
  '/logo/mantle.png',
  '/logo/plasma.png',
  '/logo/zksync.jpg',
  '/logo/flare.png',
  '/logo/telos.png',
  '/logo/sys.jpg',
  '/logo/xdc.png',
  '/logo/ethereum-classic.png',
  '/logo/ink.png',
  '/logo/fuse.png',
  '/logo/bob.jpg',
  '/logo/blast.jpeg',
  '/logo/soneium.jpg',
  '/logo/worldcoin.png',
  '/logo/lisk.png',
  '/logo/swell.png',
  '/logo/abstract.png',
  '/logo/katana.jpg',
  '/logo/sonic.jpg',
  '/logo/zora.jpg',
  '/logo/gnosis.png',
  '/logo/celo.png',
  '/logo/fantom.png',
  '/logo/moonbeam.png',
  '/logo/moonriver.png',
  '/logo/sei.png',
  '/logo/mode.jpg',
  '/logo/avalanche.png',
  '/logo/linea.png',
  '/logo/bera.png',
  '/logo/aurora.png',
];

export function CryptoDustCanvas({ size = 160 }) {
  // `size` is the CSS size in px (good default for mobile / navbar)
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Internal high-res canvas size (logical pixels)
    const logicalSize = 600;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = logicalSize * ratio;
    canvas.height = logicalSize * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const W = logicalSize;
    const H = logicalSize;

    const circleRadius = 180;
    const centerX = W / 2;
    const centerY = H / 2; // centered now (no text below)

    const darkBlue = '#003b73';
    const midBlue = '#0061b2';
    const lightBlue = '#35a7ff';

    // --- Load all logos ---
    const logos = logoPaths.map((src) => {
      const img = new Image();
      img.src = src;
      return { img, loaded: false };
    });

    let imagesLoaded = 0;
    logos.forEach((l) => {
      l.img.onload = () => {
        l.loaded = true;
        imagesLoaded += 1;
      };
    });

    // --- Build dust orbits based on logo count ---
    const dustItems = logos.map((logo, i) => {
      const total = logos.length;
      const baseRadius = 80;
      const radiusStep = 2.5;
      const radius = baseRadius + i * radiusStep; // stays inside 180

      const minSpeed = 0.25;
      const maxSpeed = 1.0;
      const speedRange = maxSpeed - minSpeed;
      const speed = minSpeed + (i / total) * speedRange;

      const offset = (2 * Math.PI * i) / total;

      return {
        logo,
        radius,
        speed,
        offset,
        size: 20,
      };
    });

    function drawCircleLogo() {
      ctx.save();
      ctx.translate(centerX, centerY);

      ctx.beginPath();
      ctx.arc(0, 0, circleRadius + 6, 0, Math.PI * 2);
      ctx.fillStyle = darkBlue;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, circleRadius, 0, Math.PI * 2);
      ctx.fillStyle = midBlue;
      ctx.fill();

      ctx.restore();
    }

    function drawBroom(time) {
      ctx.save();
      ctx.translate(centerX, centerY);

      const swing = Math.sin(time * 1.5) * 0.15;
      ctx.rotate(swing - 0.3);

      // Handle
      ctx.fillStyle = darkBlue;
      ctx.fillRect(-15, -circleRadius, 30, circleRadius * 1.1);

      // Band
      ctx.fillStyle = lightBlue;
      ctx.fillRect(-20, -20, 40, 15);

      // Head
      ctx.beginPath();
      ctx.moveTo(-60, 0);
      ctx.lineTo(60, 0);
      ctx.lineTo(45, 60);
      ctx.lineTo(-45, 60);
      ctx.closePath();
      ctx.fillStyle = lightBlue;
      ctx.fill();

      // Bristle lines
      ctx.strokeStyle = midBlue;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(-15, 60);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 60);
      ctx.moveTo(20, 0);
      ctx.lineTo(15, 60);
      ctx.stroke();

      ctx.restore();
    }

    function drawDust(time) {
      ctx.save();
      ctx.translate(centerX, centerY);

      dustItems.forEach((item) => {
        const angle = item.offset + time * item.speed;
        const x = Math.cos(angle) * item.radius;
        const y = Math.sin(angle) * item.radius;

        if (item.logo.loaded || imagesLoaded === logos.length) {
          const s = item.size;
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, s, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(item.logo.img, x - s, y - s, s * 2, s * 2);
          ctx.restore();

          // small ring around each logo
          ctx.beginPath();
          ctx.arc(x, y, s + 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // Extra tiny sparkles
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2 + time * 0.4;
        const radius = 60 + (i % 3) * 20;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        const pulse = (Math.sin(time * 3 + i) + 1) / 2;
        const s = 1 + pulse * 1.8;

        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
      }

      ctx.restore();
    }

    let frameId;

    const animate = (timestamp) => {
      const t = timestamp / 1000;

      // Clear to transparent (no blue square)
      ctx.clearRect(0, 0, W, H);

      drawCircleLogo();
      drawDust(t);
      drawBroom(t);

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${420}px`,
        height: `${420}px`,
        display: 'block',
        maxWidth: '100%', // shrinks nicely on small screens
      }}
    />
  );
}