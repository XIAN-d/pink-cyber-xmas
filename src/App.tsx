import React, { useRef, useState, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { PerspectiveCamera, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// --- 适配参数：针对移动端减小粒子量以保证 60FPS ---
const PARTICLE_COUNT = 4000; 
const COLORS = ['#FFB7C5', '#FF69B4', '#FFFFFF'];

const CyberXmasTree = ({ gestureData }: { gestureData: any }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // 生成树形目标点
  const targetPositions = useMemo(() => {
    const pos = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ratio = i / PARTICLE_COUNT;
      const angle = ratio * Math.PI * 16; 
      const radius = (1 - ratio) * 2.5;
      pos.push(new THREE.Vector3(Math.cos(angle) * radius, ratio * 7 - 3.5, Math.sin(angle) * radius));
    }
    return pos;
  }, []);

  // 爆炸状态随机点
  const explodePositions = useMemo(() => 
    Array.from({ length: PARTICLE_COUNT }, () => 
      new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 12)
    ), []);

  useFrame((state) => {
    const { isGrab, handPos } = gestureData;
    const time = state.clock.getElapsedTime();

    // 旋转控制：iOS 灵敏度适配
    meshRef.current.rotation.y += 0.005 + (handPos.x * 0.05);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const target = isGrab ? targetPositions[i] : explodePositions[i];
      // iOS 平滑插值：使用 lerp 确保动画丝滑
      dummy.position.lerp(target, 0.08);
      
      const s = isGrab ? 0.12 : 0.08;
      dummy.scale.set(s, s, s);
      dummy.rotation.y += 0.01;
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null!, null!, PARTICLE_COUNT]}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#FFB7C5" metalness={0.7} roughness={0.2} />
    </instancedMesh>
  );
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [gesture, setGesture] = useState({ isGrab: true, handPos: { x: 0, y: 0 } });
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);

  // 初始化 MediaPipe
  useEffect(() => {
    if (!started) return;

    let handLandmarker: any;
    const initAI = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
      
      // 开启摄像头
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 480, height: 360 } 
        });
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener("loadeddata", () => {
          setLoading(false);
          renderLoop();
        });
      }
    };

    const renderLoop = async () => {
      if (videoRef.current && handLandmarker) {
        const startTimeMs = performance.now();
        const results = await handLandmarker.detectForVideo(videoRef.current, startTimeMs);
        if (results.landmarks?.length > 0) {
          const finger = results.landmarks[0][8]; // 食指
          const thumb = results.landmarks[0][4];  // 大拇指
          const dist = Math.hypot(finger.x - thumb.x, finger.y - thumb.y);
          setGesture({
            isGrab: dist < 0.08,
            handPos: { x: (finger.x - 0.5) * 2, y: finger.y }
          });
        }
      }
      requestAnimationFrame(renderLoop);
    };

    initAI();
  }, [started]);

  return (
    <div className="fixed inset-0 bg-[#050103] touch-none">
      {!started ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <h1 className="text-pink-500 text-2xl font-bold mb-6 italic text-center px-4">PINK CYBER XMAS<br/>iOS ADAPTED</h1>
          <button 
            onClick={() => setStarted(true)}
            className="px-8 py-4 bg-pink-600 text-white rounded-full font-bold shadow-lg shadow-pink-500/50 active:scale-95 transition-transform"
          >
            开启摄像头并启动
          </button>
          <p className="text-gray-400 mt-4 text-sm">请允许浏览器访问摄像头</p>
        </div>
      ) : (
        <>
          <Canvas gl={{ antialias: false, powerPreference: "high-performance" }}>
            <color attach="background" args={['#050103']} />
            <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={60} />
            <ambientLight intensity={0.4} />
            <pointLight position={[10, 10, 10]} color="#FF69B4" intensity={2} />
            
            <Suspense fallback={null}>
              <CyberXmasTree gestureData={gesture} />
              <EffectComposer disableNormalPass>
                <Bloom luminanceThreshold={0.5} intensity={1.2} mipmapBlur />
              </EffectComposer>
            </Suspense>
          </Canvas>

          {/* 摄像头预览窗：针对 iOS 底部安全区优化 */}
          <div className="absolute bottom-8 left-4 w-32 h-40 rounded-2xl border-2 border-pink-500/50 overflow-hidden bg-black shadow-2xl">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover scale-x-[-1]" 
            />
            {loading && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-pink-500 animate-pulse">AI 加载中...</div>}
          </div>
        </>
      )}
    </div>
  );
}