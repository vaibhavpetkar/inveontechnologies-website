'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface NeuralNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pulse: number;
  pulseDir: number;
  connections: number[];
}

interface BenchmarkData {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const mouseRef = { current: { x: 0, y: 0 } };

interface AnimatedBackgroundProps {
  className?: string;
}

export default function AnimatedBackground({ className = '' }: AnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [nodes, setNodes] = useState<NeuralNode[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  // Initialize nodes and benchmarks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        setWidth(rect.width);
        setHeight(rect.height);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // Create neural nodes
    const newNodes: NeuralNode[] = [];
    const nodeCount = Math.min(60, Math.floor((width * height) / 20000));
    
    for (let i = 0; i < nodeCount; i++) {
      newNodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1,
        color: Math.random() > 0.6 ? '#2563eb' : Math.random() > 0.3 ? '#3b82f6' : '#7c3aed',
        pulse: Math.random() * Math.PI * 2,
        pulseDir: Math.random() > 0.5 ? 1 : -1,
        connections: [],
      });
    }

    // Create connections between nearby nodes
    newNodes.forEach((node, i) => {
      newNodes.forEach((other, j) => {
        if (i !== j) {
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150 && Math.random() > 0.7) {
            node.connections.push(j);
          }
        }
      });
    });

    setNodes(newNodes);

    // Create benchmark bars
    const benchmarkLabels = [
      { label: 'INFERENCE', value: 94, color: '#2563eb' },
      { label: 'THROUGHPUT', value: 87, color: '#3b82f6' },
      { label: 'LATENCY', value: 92, color: '#7c3aed' },
      { label: 'ACCURACY', value: 98, color: '#22c55e' },
      { label: 'EFFICIENCY', value: 89, color: '#f59e0b' },
      { label: 'SCALABILITY', value: 95, color: '#ec4899' },
    ];

    const newBenchmarks: BenchmarkData[] = benchmarkLabels.map((b, i) => ({
      ...b,
      maxValue: 100,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }));

    setBenchmarks(newBenchmarks);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [width, height]);

  // Mouse tracking
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    return () => canvas.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = 0;
    const benchmarkAnimProgress = { current: 0 };

    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 1/30);
      lastTime = time;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Draw background orbs
      drawBackgroundOrbs(ctx, width, height, time);

      // Update and draw neural network
      drawNeuralNetwork(ctx, nodes, dt, time, width, height);

      // Draw benchmark visualizations
      drawBenchmarks(ctx, benchmarks, width, height, time, benchmarkAnimProgress);

      // Draw floating particles
      drawParticles(ctx, width, height, time);

      ctx.restore();
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [nodes, benchmarks, width, height]);

  return (
    <motion.div
      className={`fixed inset-0 -z-10 overflow-hidden ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      style={{ background: 'white' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ touchAction: 'none' }}
        aria-hidden="true"
      />
      
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `
          linear-gradient(rgba(37, 99, 235, 0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(37, 99, 235, 0.08) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }} />
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 80% 50% at 20% 20%, rgba(37, 99, 235, 0.03) 0%, transparent 50%),
          radial-gradient(ellipse 60% 40% at 80% 80%, rgba(59, 130, 246, 0.03) 0%, transparent 50%),
          radial-gradient(ellipse 50% 30% at 50% 50%, rgba(124, 58, 237, 0.02) 0%, transparent 50%)
        `
      }} />
    </motion.div>
  );
}

function drawBackgroundOrbs(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const orbs = [
    { x: width * 0.15, y: height * 0.2, r: Math.min(width, height) * 0.35, color: 'rgba(37, 99, 235, 0.02)', speed: 0.0001 },
    { x: width * 0.85, y: height * 0.8, r: Math.min(width, height) * 0.3, color: 'rgba(59, 130, 246, 0.02)', speed: -0.00015 },
    { x: width * 0.5, y: height * 0.5, r: Math.min(width, height) * 0.4, color: 'rgba(124, 58, 237, 0.015)', speed: 0.00008 },
  ];

  orbs.forEach((orb, i) => {
    const angle = time * orb.speed + i * 2;
    const x = orb.x + Math.cos(angle) * 30;
    const y = orb.y + Math.sin(angle) * 20;
    
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, orb.r);
    gradient.addColorStop(0, orb.color);
    gradient.addColorStop(1, 'transparent');
    
    ctx.beginPath();
    ctx.arc(x, y, orb.r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  });
}

function drawNeuralNetwork(
  ctx: CanvasRenderingContext2D,
  nodes: NeuralNode[],
  dt: number,
  time: number,
  width: number,
  height: number
) {
  // Update node positions
  nodes.forEach(node => {
    // Mouse attraction
    const dx = mouseRef.current.x - node.x;
    const dy = mouseRef.current.y - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 200 && dist > 0) {
      const force = (200 - dist) / 200 * 0.5;
      node.vx += (dx / dist) * force * dt * 60;
      node.vy += (dy / dist) * force * dt * 60;
    }

    // Apply velocity with damping
    node.x += node.vx * dt * 60;
    node.y += node.vy * dt * 60;
    node.vx *= 0.99;
    node.vy *= 0.99;

    // Boundary bounce
    const margin = 50;
    if (node.x < margin || node.x > width - margin) node.vx *= -1;
    if (node.y < margin || node.y > height - margin) node.vy *= -1;
    node.x = Math.max(margin, Math.min(width - margin, node.x));
    node.y = Math.max(margin, Math.min(height - margin, node.y));

    // Pulse animation
    node.pulse += node.pulseDir * dt * 2;
    if (node.pulse > Math.PI * 2) node.pulse = 0;
    if (node.pulse < 0) node.pulse = Math.PI * 2;
  });

  // Draw connections
  ctx.lineWidth = 0.5;
  nodes.forEach((node, i) => {
    node.connections.forEach(j => {
      if (j < nodes.length) {
        const other = nodes[j];
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 150) {
          const opacity = (1 - dist / 150) * 0.12;
          const pulseOpacity = opacity * (0.5 + Math.sin(time * 2 + i) * 0.3);
          
          const gradient = ctx.createLinearGradient(node.x, node.y, other.x, other.y);
          gradient.addColorStop(0, hexToRgba(node.color, pulseOpacity));
          gradient.addColorStop(1, hexToRgba(other.color, pulseOpacity));
          
          ctx.strokeStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          
          // Curved connection
          const mx = (node.x + other.x) / 2;
          const my = (node.y + other.y) / 2;
          const offset = Math.sin(time + i + j) * 10;
          ctx.quadraticCurveTo(mx + offset, my + offset, other.x, other.y);
          ctx.stroke();
        }
      }
    });
  });

  // Draw nodes
  nodes.forEach((node, i) => {
    const pulseScale = 1 + Math.sin(node.pulse) * 0.3;
    const radius = node.radius * pulseScale;
    
    // Outer glow
    const glowGradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius * 4);
    glowGradient.addColorStop(0, hexToRgba(node.color, 0.1));
    glowGradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius * 4, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // Core
    const coreGradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
    coreGradient.addColorStop(0, hexToRgba(node.color, 1));
    coreGradient.addColorStop(1, hexToRgba(node.color, 0.3));
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = coreGradient;
    ctx.fill();

    // Data packets traveling along connections
    if (Math.random() < 0.002) {
      drawDataPacket(ctx, node, nodes, time);
    }
  });
}

function drawDataPacket(
  ctx: CanvasRenderingContext2D,
  node: NeuralNode,
  nodes: NeuralNode[],
  time: number
) {
  if (node.connections.length === 0) return;
  const targetIdx = node.connections[Math.floor(Math.random() * node.connections.length)];
  const target = nodes[targetIdx];
  if (!target) return;

  const progress = (time * 1000) % 2000 / 2000;
  const x = node.x + (target.x - node.x) * progress;
  const y = node.y + (target.y - node.y) * progress;
  
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#2563eb';
  ctx.shadowColor = '#2563eb';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBenchmarks(
  ctx: CanvasRenderingContext2D,
  benchmarks: BenchmarkData[],
  width: number,
  height: number,
  time: number,
  progress: { current: number }
) {
  // Animate progress
  progress.current = Math.min(1, progress.current + 0.0005);

  const panelWidth = 200;
  const panelHeight = benchmarks.length * 45 + 40;
  const panelX = width - panelWidth - 30;
  const panelY = 30;

  // Panel background
  const panelGradient = ctx.createLinearGradient(panelX, panelY, panelX + panelWidth, panelY + panelHeight);
  panelGradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  panelGradient.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
  
  ctx.fillStyle = panelGradient;
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.15)';
  ctx.lineWidth = 1;
  roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 12);
  ctx.fill();
  ctx.stroke();

  // Title
  ctx.font = '600 11px "Outfit", sans-serif';
  ctx.fillStyle = 'rgba(37, 99, 235, 0.8)';
  ctx.textAlign = 'left';
  ctx.fillText('AI BENCHMARKS', panelX + 16, panelY + 22);

  // Decorative line
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + 16, panelY + 28);
  ctx.lineTo(panelX + 60, panelY + 28);
  ctx.stroke();

  // Draw each benchmark
  benchmarks.forEach((bench, i) => {
    const y = panelY + 45 + i * 42;
    const barX = panelX + 16;
    const barY = y;
    const barWidth = panelWidth - 32;
    const barHeight = 6;
    const valueWidth = barWidth * (bench.value / 100) * progress.current;

    // Label
    ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillText(bench.label, barX, barY - 4);

    // Value
    ctx.font = '600 11px "Outfit", sans-serif';
    ctx.fillStyle = bench.color;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.floor(bench.value * progress.current)}%`, panelX + panelWidth - 16, barY - 4);
    ctx.textAlign = 'left';

    // Background bar
    const bgGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    bgGradient.addColorStop(0, 'rgba(15, 23, 42, 0.05)');
    bgGradient.addColorStop(1, 'rgba(15, 23, 42, 0.02)');
    ctx.fillStyle = bgGradient;
    roundRect(ctx, barX, barY, barWidth, barHeight, 3);
    ctx.fill();

    // Value bar with gradient
    const valueGradient = ctx.createLinearGradient(barX, barY, barX + valueWidth, barY);
    valueGradient.addColorStop(0, bench.color);
    valueGradient.addColorStop(1, adjustColor(bench.color, -30));
    ctx.fillStyle = valueGradient;
    roundRect(ctx, barX, barY, valueWidth, barHeight, 3);
    ctx.fill();

    // Glow effect on bar
    ctx.shadowColor = bench.color;
    ctx.shadowBlur = 8;
    roundRect(ctx, barX, barY, valueWidth, barHeight, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Pulsing indicator at end of bar
    if (progress.current >= 1) {
      const pulse = Math.sin(time * 3 + i) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(barX + valueWidth, barY + barHeight / 2, 3 + pulse * 2, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(bench.color, 0.6);
      ctx.fill();
    }
  });
}

function drawParticles(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const particleCount = 25;
  for (let i = 0; i < particleCount; i++) {
    const seed = i * 123.456;
    const x = (Math.sin(time * 0.1 + seed) * 0.5 + 0.5) * width;
    const y = (Math.cos(time * 0.08 + seed * 1.5) * 0.5 + 0.5) * height;
    const size = Math.sin(time * 0.5 + seed) * 1 + 1.5;
    const opacity = (Math.sin(time + seed) * 0.5 + 0.5) * 0.25;
    
    const colors = ['#2563eb', '#3b82f6', '#7c3aed', '#22c55e'];
    const color = colors[i % colors.length];
    
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.fill();
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustColor(hex: string, amount: number): string {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}