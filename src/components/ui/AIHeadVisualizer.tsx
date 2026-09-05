import { useEffect, useRef, useState } from 'react';

const AIHeadVisualizer = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, isDown: false, isHovering: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 420);

    // Particle settings
    const numParticles = 220; // Increased for more "neural" feel
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      alpha: number;
      baseAlpha: number;
      isSelected: boolean;
      frizzOffset: { x: number; y: number };
    }> = [];
    const waveLines = 20; // Increased

    // Generate random particle mesh
    for (let i = 0; i < numParticles; i++) {
      const alpha = Math.random() * 0.5 + 0.2;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        radius: Math.random() * 1.8 + 0.5,
        alpha: alpha,
        baseAlpha: alpha,
        isSelected: false,
        frizzOffset: { x: 0, y: 0 },
      });
    }

    let step = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Mouse-based speed control
      // If hovering, run forward. If not, run "opposite" (reverse/slow)
      const speedMultiplier = mouseRef.current.isHovering ? 1.5 : -0.4;
      step += 0.015 * speedMultiplier;

      // 1. Draw Animated Wave Lines
      ctx.lineWidth = 1;
      for (let i = 0; i < waveLines; i++) {
        ctx.beginPath();
        const yOffset = (height / waveLines) * i + 10;
        const opacity = 0.06 + (i % 5) * 0.025;
        ctx.strokeStyle = `rgba(37, 99, 235, ${opacity})`;

        for (let x = 0; x < width * 0.75; x += 10) {
          const wave1 = Math.sin(x * 0.01 + step + i * 0.2) * 12;
          const wave2 = Math.cos(x * 0.015 - step * 0.7) * 8;
          const y = yOffset + wave1 + wave2;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 2. Update and Draw Particles
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];

        // Selection logic: if mouse is down and near particle
        const dxMouse = p1.x - mouseRef.current.x;
        const dyMouse = p1.y - mouseRef.current.y;
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
        
        if (mouseRef.current.isDown && distMouse < 40) {
          p1.isSelected = true;
        } else if (!mouseRef.current.isDown) {
          p1.isSelected = false;
        }

        // Movement
        if (!p1.isSelected) {
          p1.x += p1.vx * speedMultiplier;
          p1.y += p1.vy * speedMultiplier;
          p1.frizzOffset = { x: 0, y: 0 };
          p1.alpha = p1.baseAlpha;
        } else {
          // Frizz effect: rapid jitter
          p1.frizzOffset = {
            x: (Math.random() - 0.5) * 6,
            y: (Math.random() - 0.5) * 6,
          };
          // Blinking effect: rapid alpha change
          p1.alpha = Math.random() > 0.5 ? 1.0 : 0.2;
          
          // Follow mouse slightly when grabbed
          p1.x += (mouseRef.current.x - p1.x) * 0.1;
          p1.y += (mouseRef.current.y - p1.y) * 0.1;
        }

        // Bounce off bounds
        if (p1.x < 0 || p1.x > width) {
          p1.vx *= -1;
          p1.x = Math.max(0, Math.min(width, p1.x));
        }
        if (p1.y < 0 || p1.y > height) {
          p1.vy *= -1;
          p1.y = Math.max(0, Math.min(height, p1.y));
        }

        // Draw particle
        const drawX = p1.x + p1.frizzOffset.x;
        const drawY = p1.y + p1.frizzOffset.y;

        ctx.beginPath();
        ctx.arc(drawX, drawY, p1.radius * (p1.isSelected ? 2 : 1), 0, Math.PI * 2);
        ctx.fillStyle = p1.isSelected 
          ? `rgba(239, 68, 68, ${p1.alpha})` // Red fizz for selected
          : `rgba(37, 99, 235, ${p1.alpha * 0.7})`;
        ctx.fill();

        // Connect nearby particles (Neural Network)
        const connectionLimit = mouseRef.current.isHovering ? 100 : 75;
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionLimit) {
            ctx.beginPath();
            ctx.moveTo(drawX, drawY);
            ctx.lineTo(p2.x + p2.frizzOffset.x, p2.y + p2.frizzOffset.y);
            const lineOpacity = (1 - dist / connectionLimit) * (p1.isSelected || p2.isSelected ? 0.4 : 0.18);
            ctx.strokeStyle = p1.isSelected || p2.isSelected
              ? `rgba(239, 68, 68, ${lineOpacity})`
              : `rgba(37, 99, 235, ${lineOpacity})`;
            ctx.lineWidth = p1.isSelected || p2.isSelected ? 0.8 : 0.5;
            ctx.stroke();
          }
        }
      }

      // 3. Head Silhouette Outline
      const headCenterX = width * 0.78;
      const headCenterY = height * 0.5;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.4)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = mouseRef.current.isHovering ? 20 : 10;
      ctx.shadowColor = 'rgba(37, 99, 235, 0.5)';

      ctx.moveTo(headCenterX - 30, headCenterY - 140);
      ctx.quadraticCurveTo(headCenterX + 35, headCenterY - 120, headCenterX + 45, headCenterY - 60);
      ctx.lineTo(headCenterX + 55, headCenterY - 30);
      ctx.lineTo(headCenterX + 40, headCenterY - 15);
      ctx.quadraticCurveTo(headCenterX + 48, headCenterY + 10, headCenterX + 35, headCenterY + 25);
      ctx.quadraticCurveTo(headCenterX + 42, headCenterY + 60, headCenterX + 10, headCenterY + 110);
      ctx.stroke();
      ctx.restore();

      // 4. Neural nodes along silhouette
      const silhouettePoints = [
        { x: headCenterX - 30, y: headCenterY - 140 },
        { x: headCenterX + 45, y: headCenterY - 60 },
        { x: headCenterX + 55, y: headCenterY - 30 },
        { x: headCenterX + 35, y: headCenterY + 25 },
        { x: headCenterX + 10, y: headCenterY + 110 },
      ];
      
      silhouettePoints.forEach((point, idx) => {
        const pulse = Math.sin(step * 4 + idx) * 0.4 + 0.8;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(37, 99, 235, ${0.5 * pulse})`;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(37, 99, 235, ${0.2 * pulse})`;
        ctx.stroke();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Event Listeners
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    };

    const handleMouseDown = () => { mouseRef.current.isDown = true; };
    const handleMouseUp = () => { mouseRef.current.isDown = false; };
    const handleMouseEnter = () => { mouseRef.current.isHovering = true; };
    const handleMouseLeave = () => { 
      mouseRef.current.isHovering = false; 
      mouseRef.current.isDown = false;
    };

    const handleResize = () => {
      if (canvas.parentElement) {
        width = canvas.width = canvas.parentElement.clientWidth;
        height = canvas.height = canvas.parentElement.clientHeight;
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseenter', handleMouseEnter);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseenter', handleMouseEnter);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '420px',
        borderRadius: '16px',
        overflow: 'hidden',
        cursor: 'crosshair',
      }}
      className="bg-transparent"
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default AIHeadVisualizer;
