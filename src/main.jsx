import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import {
  ArrowLeft, Bell, BookOpen, CalendarDays, ChevronRight, Disc3, ExternalLink,
  FileText, Film, Heart, Home, MessageSquare,
  Music2, Pause, Play, Repeat, Search, Shuffle, SkipBack, SkipForward, User, Volume2, X, ListMusic
} from 'lucide-react';
import './styles.css';

/* ============================================================
   BASE PATH — works in dev (/) and GitHub Pages (/The-Dream-of-Game/)
   ============================================================ */
const BASE = import.meta.env.BASE_URL;
const MEDIA_BASE_URL = (import.meta.env.VITE_MEDIA_BASE_URL || '').replace(/\/+$/, '');

/* ============================================================
   SUPABASE CLIENT
   ============================================================ */
const supabase = createClient(
  'https://jneojujazbtafdihtvul.supabase.co',
  'sb_publishable_olYKJREN0z2jRnNE7Dk2NA_WiLNUX2O'
);
const STORAGE_BUCKET = 'forum-images';

/* ============================================================
   CONTENT CONFIG
   ============================================================ */
const contentFiles = {
  knowledge: `${BASE}content/knowledge/documents.json`,
  events: `${BASE}content/events/events.json`,
  forum: `${BASE}content/forum/boards.json`,
  media: `${BASE}content/media/videos.json`,
  music: `${BASE}content/music/tracks.json`,
  members: `${BASE}content/members/members.json`,
  projects: `${BASE}content/projects/projects.json`,
  resources: `${BASE}content/resources/resources.json`,
  tools: `${BASE}content/tools/ai-tools.json`,
  stats: `${BASE}content/site/stats.json`,
  integrations: `${BASE}content/integrations/feishu.json`,
  giscus: `${BASE}content/forum/giscus.json`
};

const routeMap = { home: '首页', knowledge: '文章', events: '活动', forum: '论坛', media: '视频', music: '音乐', resources: '资源', profile: '个人主页' };

const navItems = [
  { route: 'home', label: '首页', sub: 'HOME', icon: Home },
  { route: 'knowledge', label: '文章', sub: 'ARTICLES', icon: BookOpen },
  { route: 'events', label: '活动', sub: 'EVENTS', icon: CalendarDays },
  { route: 'forum', label: '论坛', sub: 'FORUM', icon: MessageSquare },
  { route: 'media', label: '视频', sub: 'MEDIA', icon: Film },
  { route: 'music', label: '音乐', sub: 'MUSIC', icon: Music2 },
  { route: 'resources', label: '资源', sub: 'RESOURCES', icon: FileText },
  { route: 'profile', label: '个人', sub: 'PROFILE', icon: User }
];

const emptyData = { knowledge:[], events:[], forum:[], media:[], music:[], members:[], projects:[], resources:[], tools:[], stats:[], integrations:{links:[]}, giscus:{} };

// Helper: prepend BASE to internal paths, leave external URLs alone
const asset = (path) => (!path || path.startsWith('http') ? path : `${BASE}${path.replace(/^\//, '')}`);
const videoSource = (video) => {
  if (MEDIA_BASE_URL && video?.objectKey) {
    const key = video.objectKey.split('/').map(encodeURIComponent).join('/');
    return `${MEDIA_BASE_URL}/${key}`;
  }
  return import.meta.env.DEV && video?.localSrc ? asset(video.localSrc) : '';
};

/* ============================================================
   ROUTING
   ============================================================ */
function getHash() { return window.location.hash.replace(/^#\/?/,'') || 'home'; }
function go(route) { window.location.hash = `/${route}`; }

function useRoute() {
  const [full, setFull] = useState(getHash);
  useEffect(() => {
    const cb = () => { setFull(getHash()); window.scrollTo({ top: 0, behavior: 'instant' }); };
    window.addEventListener('hashchange', cb);
    return () => window.removeEventListener('hashchange', cb);
  }, []);
  const [route, ...sub] = full.split('/');
  return { route: routeMap[route] ? route : 'home', sub: sub.join('/') };
}

function useContent() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    Promise.all(Object.entries(contentFiles).map(async ([key, url]) => {
      try { const r = await fetch(url); if (!r.ok) return [key, emptyData[key]]; return [key, await r.json()]; }
      catch { return [key, emptyData[key]]; }
    })).then(e => alive && setData({...emptyData, ...Object.fromEntries(e)})).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  return { data, loading };
}

function useMobileMode() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return mobile;
}

function useLocalStorage(key, iv) {
  const [v, sv] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? iv; } catch { return iv; } });
  useEffect(() => localStorage.setItem(key, JSON.stringify(v)), [key, v]);
  return [v, sv];
}

/* ============================================================
   SUPABASE AUTH — GitHub OAuth
   ============================================================ */
function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Ensure profile exists (first-time login)
  const ensureProfile = async (u) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', u.id).single();
    const login = u.user_metadata?.user_name || '';
    const isXiaoHeHe = login === 'xiao-he-he';
    if (!profile) {
      await supabase.from('profiles').insert({
        id: u.id,
        username: login || 'user',
        display_name: u.user_metadata?.full_name || login || u.email,
        avatar_url: u.user_metadata?.avatar_url || '',
        is_admin: isXiaoHeHe
      });
      return { is_admin: isXiaoHeHe };
    }
    // Update admin status if it should be but isn't
    if (isXiaoHeHe && !profile.is_admin) {
      await supabase.from('profiles').update({ is_admin: true }).eq('id', u.id);
      return { ...profile, is_admin: true };
    }
    return profile;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        ensureProfile(u).then((profile) => {
          setUser({
            id: u.id, login: u.user_metadata?.user_name || u.email,
            name: u.user_metadata?.full_name || u.user_metadata?.user_name,
            avatar: u.user_metadata?.avatar_url, isAdmin: profile?.is_admin || false
          });
        });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const u = session.user;
        const profile = await ensureProfile(u);
        setUser({
          id: u.id, login: u.user_metadata?.user_name || u.email,
          name: u.user_metadata?.full_name || u.user_metadata?.user_name,
          avatar: u.user_metadata?.avatar_url, isAdmin: profile?.is_admin || false
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = () => {
    supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin + BASE }
    });
  };
  const logout = () => supabase.auth.signOut();

  return { user, loading, login, logout };
}

/* ============================================================
   CLICK SPARK — 鼠标动效.md
   sparkColor="#fff" sparkSize={10} sparkRadius={15} sparkCount={8} duration={400}
   ============================================================ */
function ClickSpark({ sparkColor = '#EF4444', sparkSize = 20, sparkRadius = 30, sparkCount = 10, duration = 400, disabled = false, children }) {
  const canvasRef = useRef(null);
  const sparksRef = useRef([]);
  useEffect(() => {
    if (disabled) return undefined;
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (time) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sparksRef.current = sparksRef.current.filter(s => {
        const e = time - s.startTime; if (e >= duration) return false;
        const p = e / duration, eased = p * (2 - p);
        const d = eased * sparkRadius, l = sparkSize * (1 - eased);
        const x1 = s.x + d * Math.cos(s.angle), y1 = s.y + d * Math.sin(s.angle);
        const x2 = s.x + (d + l) * Math.cos(s.angle), y2 = s.y + (d + l) * Math.sin(s.angle);
        ctx.strokeStyle = sparkColor; ctx.globalAlpha = 1 - p; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalAlpha = 1;
        return true;
      });
      frame = requestAnimationFrame(draw);
    };
    resize(); frame = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [sparkColor, sparkSize, sparkRadius, sparkCount, duration, disabled]);
  const onClick = useCallback((e) => {
    if (disabled) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const now = performance.now();
    sparksRef.current.push(...Array.from({ length: sparkCount }, (_, i) => ({
      x: e.clientX - rect.left, y: e.clientY - rect.top,
      startTime: now, angle: (2 * Math.PI * i) / sparkCount
    })));
  }, [sparkCount, disabled]);
  return <div className="click-spark" onClick={disabled ? undefined : onClick}>{!disabled && <canvas ref={canvasRef} />}{children}</div>;
}

/* ============================================================
   PIXEL SNOW — 背景动效.md (Three.js WebGL, max resolution)
   ============================================================ */
const PV = `void main(){gl_Position=vec4(position,1.0);}`;
const PF = `precision mediump float;
uniform float uTime;uniform vec2 uResolution;uniform float uFlakeSize;uniform float uMinFlakeSize;
uniform float uPixelResolution;uniform float uSpeed;uniform float uDepthFade;uniform float uFarPlane;
uniform vec3 uColor;uniform float uBrightness;uniform float uGamma;uniform float uDensity;
uniform float uVariant;uniform float uDirection;
#define PI 3.14159265
#define PI_OVER_6 0.5235988
#define PI_OVER_3 1.0471976
#define M1 1597334677U
#define M2 3812015801U
#define M3 3299493293U
#define F0 2.3283064e-10
#define hash(n) (n*(n^(n>>15)))
#define coord3(p) (uvec3(p).x*M1^uvec3(p).y*M2^uvec3(p).z*M3)
const vec3 camK=vec3(0.57735027,0.57735027,0.57735027);
const vec3 camI=vec3(0.70710678,0.0,-0.70710678);
const vec3 camJ=vec3(-0.40824829,0.81649658,-0.40824829);
const vec2 b1d=vec2(0.574,0.819);
vec3 hash3(uint n){uvec3 hh=hash(n)*uvec3(1U,511U,262143U);return vec3(hh)*F0;}
float snowflakeDist(vec2 p){
  float r=length(p);float a=atan(p.y,p.x);
  a=abs(mod(a+PI_OVER_6,PI_OVER_3)-PI_OVER_6);
  vec2 q=r*vec2(cos(a),sin(a));
  float dM=max(abs(q.y),max(-q.x,q.x-1.0));
  float b1t=clamp(dot(q-vec2(0.4,0.0),b1d),0.0,0.4);
  float dB1=length(q-vec2(0.4,0.0)-b1t*b1d);
  float b2t=clamp(dot(q-vec2(0.7,0.0),b1d),0.0,0.25);
  float dB2=length(q-vec2(0.7,0.0)-b2t*b1d);
  return min(dM,min(dB1,dB2))*10.0;
}
void main(){
  float invPR=1.0/uPixelResolution;
  float pS=max(1.0,floor(0.5+uResolution.x*invPR));
  float invPS=1.0/pS;
  vec2 fc=floor(gl_FragCoord.xy*invPS);
  vec2 res=uResolution*invPS;
  float invRX=1.0/res.x;
  vec3 ray=normalize(vec3((fc-res*0.5)*invRX,1.0));
  ray=ray.x*camI+ray.y*camJ+ray.z*camK;
  float tS=uTime*uSpeed;
  float wX=cos(uDirection)*0.4;float wY=sin(uDirection)*0.4;
  vec3 camPos=(wX*camI+wY*camJ+0.1*camK)*tS;
  vec3 pos=camPos;
  vec3 aR=max(abs(ray),vec3(0.001));
  vec3 strides=1.0/aR;
  vec3 rS=step(ray,vec3(0.0));
  vec3 phase=fract(pos)*strides;
  phase=mix(strides-phase,phase,rS);
  float rDCK=dot(ray,camK);float invRDCK=1.0/rDCK;
  float invDF=1.0/uDepthFade;float hIRX=0.5*invRX;
  vec3 tA=tS*0.1*vec3(7.0,8.0,5.0);
  float t=0.0;
  for(int i=0;i<128;i++){
    if(t>=uFarPlane)break;
    vec3 fp=floor(pos);
    uint cc=coord3(fp);float cH=hash3(cc).x;
    if(cH<uDensity){
      vec3 h=hash3(cc);
      vec3 sA1=fp.yzx*0.073;vec3 sA2=fp.zxy*0.27;
      vec3 flakePos=0.5-0.5*cos(4.0*sin(sA1)+4.0*sin(sA2)+2.0*h+tA);
      flakePos=flakePos*0.8+0.1+fp;
      float toI=dot(flakePos-pos,camK)*invRDCK;
      if(toI>0.0){
        vec3 testPos=pos+ray*toI-flakePos;
        float testX=dot(testPos,camI);float testY=dot(testPos,camJ);
        float depth=dot(flakePos-camPos,camK);
        float fS=max(uFlakeSize,uMinFlakeSize*depth*hIRX);
        float dist;
        if(uVariant<0.5){dist=max(abs(testX),abs(testY));}
        else if(uVariant<1.5){dist=length(vec2(testX,testY));}
        else{dist=snowflakeDist(vec2(testX,testY)/fS)*fS;}
        if(dist<fS){
          float fSR=uFlakeSize/fS;
          float intensity=exp2(-(t+toI)*invDF)*min(1.0,fSR*fSR)*uBrightness;
          gl_FragColor=vec4(uColor*pow(vec3(intensity),vec3(uGamma)),1.0);
          return;
        }
      }
    }
    float nS=min(min(phase.x,phase.y),phase.z);
    vec3 sel=step(phase,vec3(nS));phase=phase-nS+strides*sel;t+=nS;
    pos=mix(pos+ray*nS,floor(pos+ray*nS+0.5),sel);
  }
  gl_FragColor=vec4(0.0);
}`;

function PixelSnow({
  color = '#e8eef4', flakeSize = 0.008, minFlakeSize = 1.0,
  pixelResolution = 800, speed = 0.7, depthFade = 7, farPlane = 20,
  brightness = 0.65, gamma = 0.4545, density = 0.22,
  variant = 'snowflake', direction = 130, className = '', style = {}
}) {
  const containerRef = useRef(null);
  const animRef = useRef(0);
  const visibleRef = useRef(true);
  const rendererRef = useRef(null);
  const materialRef = useRef(null);
  const rtRef = useRef(null);
  const threeRef = useRef(null);

  const vv = useMemo(() => variant === 'round' ? 1.0 : variant === 'snowflake' ? 2.0 : 0.0, [variant]);

  const handleResize = useCallback(() => {
    if (rtRef.current) clearTimeout(rtRef.current);
    rtRef.current = window.setTimeout(() => {
      const c = containerRef.current, r = rendererRef.current, m = materialRef.current;
      if (!c || !r || !m) return;
      r.setSize(c.offsetWidth, c.offsetHeight);
      m.uniforms.uResolution.value.set(c.offsetWidth, c.offsetHeight);
    }, 100);
  }, []);

  useEffect(() => {
    const c = containerRef.current; if (!c) return;
    const obs = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting; }, { threshold: 0 });
    obs.observe(c); return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const c = containerRef.current; if (!c) return;
    let disposed = false;
    let renderer = null;
    let material = null;
    let geometry = null;

    import('three').then((three) => {
      if (disposed || !containerRef.current) return;
      const { Color, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer } = three;
      threeRef.current = { Color };
      const scene = new Scene();
      const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
      renderer = new WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(c.offsetWidth, c.offsetHeight);
      renderer.setClearColor(0x000000, 0);
      c.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const initialColor = new Color(color);
      material = new ShaderMaterial({
        vertexShader: PV, fragmentShader: PF,
        uniforms: {
          uTime: { value: 0 }, uResolution: { value: new Vector2(c.offsetWidth, c.offsetHeight) },
          uFlakeSize: { value: flakeSize }, uMinFlakeSize: { value: minFlakeSize },
          uPixelResolution: { value: pixelResolution }, uSpeed: { value: speed },
          uDepthFade: { value: depthFade }, uFarPlane: { value: farPlane },
          uColor: { value: new Vector3(initialColor.r, initialColor.g, initialColor.b) }, uBrightness: { value: brightness },
          uGamma: { value: gamma }, uDensity: { value: density },
          uVariant: { value: vv }, uDirection: { value: (direction * Math.PI) / 180 }
        }, transparent: true
      });
      materialRef.current = material;
      geometry = new PlaneGeometry(2, 2);
      scene.add(new Mesh(geometry, material));
      window.addEventListener('resize', handleResize);

      const st = performance.now();
      const anim = () => {
        animRef.current = requestAnimationFrame(anim);
        if (visibleRef.current && material && renderer) {
          material.uniforms.uTime.value = (performance.now() - st) * 0.001;
          renderer.render(scene, cam);
        }
      };
      anim();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(animRef.current); window.removeEventListener('resize', handleResize);
      if (rtRef.current) clearTimeout(rtRef.current);
      if (renderer?.domElement && c.contains(renderer.domElement)) c.removeChild(renderer.domElement);
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      rendererRef.current = null; materialRef.current = null; threeRef.current = null;
    };
  }, [handleResize]);

  useEffect(() => {
    const m = materialRef.current; if (!m) return;
    m.uniforms.uFlakeSize.value = flakeSize; m.uniforms.uMinFlakeSize.value = minFlakeSize;
    m.uniforms.uPixelResolution.value = pixelResolution; m.uniforms.uSpeed.value = speed;
    m.uniforms.uDepthFade.value = depthFade; m.uniforms.uFarPlane.value = farPlane;
    m.uniforms.uBrightness.value = brightness; m.uniforms.uGamma.value = gamma;
    m.uniforms.uDensity.value = density; m.uniforms.uVariant.value = vv;
    m.uniforms.uDirection.value = (direction * Math.PI) / 180;
    const Color = threeRef.current?.Color;
    if (Color) {
      const c = new Color(color);
      m.uniforms.uColor.value.set(c.r, c.g, c.b);
    }
  }, [flakeSize, minFlakeSize, pixelResolution, speed, depthFade, farPlane, brightness, gamma, density, vv, direction, color]);

  return <div ref={containerRef} className={`pixel-snow-container ${className}`} style={style} />;
}

/* ============================================================
   GRADIENT TEXT — 文本动效.md
   ============================================================ */
function GradientText({ children, colors = ['#EAB308', '#FF9FFC', '#B497CF'], speed = 3, className = '' }) {
  const gc = [...colors, colors[0]].join(', ');
  return (
    <span className={`gradient-text${className ? ' ' + className : ''}`} style={{
      backgroundImage: `linear-gradient(135deg, ${gc})`, backgroundSize: '300% 300%', animationDuration: `${speed}s`
    }}>{children}</span>
  );
}

const MAX_SLIDER_OVERFLOW = 50;

function decaySliderOverflow(value, max) {
  if (max === 0) return 0;
  const entry = value / max;
  return 2 * (1 / (1 + Math.exp(-entry)) - 0.5) * max;
}

function ElasticSlider({ defaultValue = 50, startingValue = 0, maxValue = 100, isStepped = false, stepSize = 1, leftIcon, rightIcon, onChange }) {
  const [value, setValue] = useState(defaultValue);
  const [region, setRegion] = useState('middle');
  const sliderRef = useRef(null);
  const draggingRef = useRef(false);
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);

  useEffect(() => { setValue(defaultValue); }, [defaultValue]);

  useMotionValueEvent(clientX, 'change', (latest) => {
    if (!sliderRef.current) return;
    const { left, right } = sliderRef.current.getBoundingClientRect();
    let nextRegion = 'middle';
    let overflowDistance = 0;

    if (latest < left) {
      nextRegion = 'left';
      overflowDistance = left - latest;
    } else if (latest > right) {
      nextRegion = 'right';
      overflowDistance = latest - right;
    }

    setRegion(nextRegion);
    overflow.jump(decaySliderOverflow(overflowDistance, MAX_SLIDER_OVERFLOW));
  });

  const wrapperOpacity = useTransform(scale, [1, 1.2], [0.7, 1]);
  const leftIconX = useTransform(() => region === 'left' ? -overflow.get() / scale.get() : 0);
  const rightIconX = useTransform(() => region === 'right' ? overflow.get() / scale.get() : 0);
  const trackScaleX = useTransform(() => {
    const width = sliderRef.current?.getBoundingClientRect().width || 1;
    return 1 + overflow.get() / width;
  });
  const trackScaleY = useTransform(overflow, [0, MAX_SLIDER_OVERFLOW], [1, 0.8]);
  const trackHeight = useTransform(scale, [1, 1.2], [6, 12]);
  const trackMargin = useTransform(scale, [1, 1.2], [0, -3]);
  const trackOrigin = useTransform(() => {
    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect) return 'center';
    return clientX.get() < rect.left + rect.width / 2 ? 'right' : 'left';
  });

  const totalRange = maxValue - startingValue;
  const percentage = totalRange === 0 ? 0 : ((value - startingValue) / totalRange) * 100;

  const commitValue = useCallback((nextValue) => {
    let normalized = Math.min(Math.max(nextValue, startingValue), maxValue);
    if (isStepped) normalized = Math.round(normalized / stepSize) * stepSize;
    setValue(normalized);
    onChange?.(normalized);
  }, [isStepped, maxValue, onChange, startingValue, stepSize]);

  const updateFromPointer = useCallback((event) => {
    if (!sliderRef.current) return;
    const { left, width } = sliderRef.current.getBoundingClientRect();
    const nextValue = startingValue + ((event.clientX - left) / width) * totalRange;
    commitValue(nextValue);
    clientX.jump(event.clientX);
  }, [clientX, commitValue, startingValue, totalRange]);

  const handlePointerDown = (event) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };

  const handlePointerMove = (event) => {
    if (draggingRef.current) updateFromPointer(event);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    animate(overflow, 0, { type: 'spring', bounce: 0.5 });
  };

  const handleKeyDown = (event) => {
    const increment = isStepped ? stepSize : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') commitValue(value - increment);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') commitValue(value + increment);
    else if (event.key === 'Home') commitValue(startingValue);
    else if (event.key === 'End') commitValue(maxValue);
    else return;
    event.preventDefault();
  };

  return (
    <div className="elastic-slider">
      <motion.div
        className="elastic-slider-wrap"
        style={{ scale, opacity: wrapperOpacity }}
        onHoverStart={() => animate(scale, 1.2)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.2)}
        onTouchEnd={() => animate(scale, 1)}
      >
        <motion.span
          className="elastic-slider-icon"
          style={{ x: leftIconX }}
          animate={{ scale: region === 'left' ? [1, 1.4, 1] : 1 }}
          transition={{ duration: 0.25 }}
        >{leftIcon}</motion.span>
        <div
          ref={sliderRef}
          className="elastic-slider-root"
          role="slider"
          tabIndex={0}
          aria-label="音量"
          aria-valuemin={startingValue}
          aria-valuemax={maxValue}
          aria-valuenow={Math.round(value)}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        >
          <motion.div className="elastic-slider-track-wrap" style={{
            scaleX: trackScaleX,
            scaleY: trackScaleY,
            transformOrigin: trackOrigin,
            height: trackHeight,
            marginTop: trackMargin,
            marginBottom: trackMargin
          }}>
            <div className="elastic-slider-track">
              <div className="elastic-slider-range" style={{ width: `${percentage}%` }} />
            </div>
          </motion.div>
        </div>
        <motion.span
          className="elastic-slider-icon"
          style={{ x: rightIconX }}
          animate={{ scale: region === 'right' ? [1, 1.4, 1] : 1 }}
          transition={{ duration: 0.25 }}
        >{rightIcon}</motion.span>
      </motion.div>
      <span className="elastic-slider-value">{Math.round(value)}</span>
    </div>
  );
}

/* ============================================================
   GSAP PAGE ANIMATIONS — Dramatic, all pages
   ============================================================ */
function useGsapPage(route, loading) {
  useEffect(() => {
    if (loading) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobileLayout = window.matchMedia('(max-width: 760px)').matches;
    if (reducedMotion || mobileLayout) {
      document.querySelectorAll('.opening-mask, .opening-mask-sub').forEach((mask) => {
        mask.style.display = 'none';
      });
      return;
    }
    let ctx = null;
    let timer = 0;
    let cancelled = false;
    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([gsapModule, scrollModule]) => {
      if (cancelled) return;
      const gsap = gsapModule.default;
      gsap.registerPlugin(scrollModule.ScrollTrigger);
      timer = window.setTimeout(() => {
      ctx = gsap.context(() => {
        const isHome = route === 'home';

        // === OPENING MASK (home only — sub-pages use CSS animation) ===
        if (isHome) {
          const mask = document.querySelector('.opening-mask');
          if (mask) {
            gsap.fromTo(mask, { yPercent: 0 }, { yPercent: -105, duration: 0.4, ease: 'power4.inOut' });
          }
        }

        // === TITLE DECOMPRESSION (all pages) ===
        const titleLines = document.querySelectorAll('.hero-title-line');
        const subTitleLine = document.querySelector('.sub-hero-title-line');

        if (titleLines.length) {
          gsap.fromTo(titleLines,
            { yPercent: 110, scaleY: 0.62, rotateX: 28 },
            { yPercent: 0, scaleY: 1, rotateX: 0, duration: 1.7, ease: 'expo.out', stagger: 0.20, delay: 1.0 }
          );
        } else if (subTitleLine) {
          gsap.fromTo(subTitleLine,
            { yPercent: 110, scaleY: 0.62, rotateX: 28 },
            { yPercent: 0, scaleY: 1, rotateX: 0, duration: 1.5, ease: 'expo.out', delay: 0.7 }
          );
        }

        // === DETAILS STAGGER (all pages) ===
        if (isHome) {
          const details = document.querySelectorAll('.hero-subtitle, .hero-meta, .hero-copy p, .hero-actions');
          if (details.length) {
            gsap.fromTo(details,
              { opacity: 0, y: 34 },
              { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', stagger: 0.18, delay: 2.2 }
            );
          }
          const heroIdx = document.querySelectorAll('.hero-index > div');
          if (heroIdx.length) {
            gsap.fromTo(heroIdx,
              { opacity: 0, x: 80, skewX: -10 },
              { opacity: 1, x: 0, skewX: -6, duration: 1.0, ease: 'power4.out', stagger: 0.12, delay: 2.4 }
            );
          }
        } else {
          // Sub-page: kicker + content stagger (matches home pacing)
          const pageKicker = document.querySelector('.page-hero .kicker');
          if (pageKicker) {
            gsap.fromTo(pageKicker,
              { opacity: 0, x: -30 },
              { opacity: 1, x: 0, duration: 0.9, ease: 'power3.out', delay: 0.9 }
            );
          }
          const firstSection = document.querySelector('.page-shell .content-section');
          if (firstSection) {
            const firstCards = firstSection.querySelectorAll('.ak-card, .preview-link, .admin-card');
            if (firstCards.length) {
              gsap.fromTo(firstCards,
                { y: 70, opacity: 0, rotateX: 6, scale: 0.96 },
                { y: 0, opacity: 1, rotateX: 0, scale: 1, duration: 0.8, ease: 'power4.out', stagger: 0.1, delay: 1.4 }
              );
            }
          }
        }

        // === SCROLL SECTIONS (all pages) ===
        gsap.utils.toArray('.animated-section').forEach((section) => {
          const title = section.querySelector('.section-title');
          const cards = section.querySelectorAll('.ak-card, .preview-link, .admin-card');
          // Skip the first section on sub-pages (already animated above)
          const isFirstSubSection = !isHome && section.closest('.page-shell') && section === section.closest('.page-shell').querySelector('.content-section');

          if (title) {
            gsap.fromTo(title,
              { x: -130, opacity: 0, skewX: -10, clipPath: 'inset(0 100% 0 0)' },
              { x: 0, opacity: 1, skewX: 0, clipPath: 'inset(0 0% 0 0)',
                duration: 1.05, ease: 'expo.out',
                scrollTrigger: { trigger: section, start: 'top 74%', once: true }
              }
            );
          }
          if (cards.length && !isFirstSubSection) {
            gsap.fromTo(cards,
              { y: 78, opacity: 0, rotateX: 9, clipPath: 'inset(0 0 18% 0)' },
              { y: 0, opacity: 1, rotateX: 0, clipPath: 'inset(0 0 0% 0)',
                duration: 0.92, ease: 'power4.out', stagger: 0.08,
                scrollTrigger: { trigger: section, start: 'top 68%', once: true }
              }
            );
          }
        });

        // === HOME: Hero parallax ===
        if (isHome) {
          const heroBg = document.querySelector('.hero-bg');
          if (heroBg) {
            gsap.to(heroBg, { y: -40, ease: 'none',
              scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
            });
          }
        }
      });
      }, 250);
    });

    return () => { cancelled = true; clearTimeout(timer); if (ctx) ctx.revert(); };
  }, [route, loading]);
}

/* ============================================================
   TOP NAVIGATION — Flush to top
   ============================================================ */
function TopNav({ route, user, onLogin, onLogout }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`top-nav${scrolled ? ' scrolled' : ''}`}>
      <button className="brand" onClick={() => go('home')}><span>TDG</span><strong>梦游室</strong></button>
      <nav className={open ? 'open' : ''}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.route} className={route === item.route ? 'active' : ''} onClick={() => { go(item.route); setOpen(false); }}><Icon size={15} /><span>{item.label}</span><small>{item.sub}</small></button>;
        })}
      </nav>
      <div className="account-pill">
        {user ? (
          <button onClick={onLogout} className="gh-user-btn">
            <img src={user.avatar} alt="" className="gh-avatar" />
            <span>{user.login}</span>
          </button>
        ) : (
          <button onClick={onLogin} title="登录后查看个人主页并参与论坛"><User size={15} />登录</button>
        )}
      </div>
      <button className="mobile-toggle" onClick={() => setOpen(v => !v)} aria-label="导航菜单">{open ? <X size={18} /> : <ChevronRight size={18} />}</button>
    </header>
  );
}

/* ============================================================
   LAYOUT SHELLS
   ============================================================ */
function PageShell({ eyebrow, title, children }) {
  return (
    <main className="page-shell">
      <div className="opening-mask-sub" />
      <section className="page-hero animated-section">
        <span className="kicker"><GradientText>{eyebrow}</GradientText></span>
        <h1 className="section-title"><span className="sub-hero-title-line">{title}</span></h1>
      </section>
      {children}
    </main>
  );
}
function Section({ id, eyebrow, title, children }) {
  return (
    <section id={id} className="content-section animated-section">
      <span className="kicker"><GradientText>{eyebrow}</GradientText></span>
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}
function Empty({ compact = false }) { return <div className={compact ? 'empty compact-empty' : 'empty'}>暂无</div>; }

/* ============================================================
   HOME PAGE
   ============================================================ */
function HomePage({ data }) {
  const previews = [
    { route: 'knowledge', label: '文章知识库', sub: '飞书文档与设计笔记', count: data.knowledge.length },
    { route: 'events', label: '活动公告', sub: '报名、日历与活动回顾', count: data.events.length },
    { route: 'forum', label: '社团论坛', sub: '技术交流、项目招募与讨论', count: data.forum.length },
    { route: 'media', label: '视频中心', sub: 'Bilibili 合集与录像归档', count: data.media.length },
    { route: 'music', label: '音乐库', sub: '全局播放器与歌单', count: data.music.length },
    { route: 'resources', label: '资源中心', sub: '模板、资料与工具导航', count: data.resources.length },
    { route: 'profile', label: '个人主页', sub: '个人信息、发帖、评论与回复', meta: '社区档案' }
  ];
  return (
    <main>
      <section className="hero">
        <div className="opening-mask" />
        <div className="hero-bg" style={{ backgroundImage: `linear-gradient(100deg, rgba(8,12,18,0.92), rgba(8,12,18,0.48) 42%, rgba(8,12,18,0.18)), linear-gradient(180deg, rgba(8,12,18,0.02), var(--bg) 94%), url("${BASE}概念设计图/背景图.png")` }} />
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="hero-meta">梦游室官方网站 / 游戏创作社群</span>
            <h1>
              <span><span className="hero-title-line"><GradientText>梦游室</GradientText></span></span>
              <span><span className="hero-title-line">游戏创作社群</span></span>
            </h1>
            <span className="hero-subtitle">The Dream of Game (TDG)</span>
            <p>面向游戏开发、美术设计、技术交流与项目协作的同好会数字基地。我们记录知识，组织活动，保存作品，连接正在创造游戏的人。</p>
            <div className="hero-actions">
              <button className="primary-action" onClick={() => go('knowledge')}>进入文章库</button>
              <button className="ghost-action" onClick={() => go('forum')}>进入论坛</button>
            </div>
          </div>
          <div className="hero-side">
            <div className="hero-index">
              {data.stats.slice(0, 4).map((stat, index) => (
                <div key={stat.label}><small>{String(index + 1).padStart(2, '0')}</small><strong>{stat.value}</strong><span>{stat.label}</span></div>
              ))}
            </div>
            <article className="join-card">
              <div>
                <small>JOIN TDG</small>
                <h2>加入梦游室群聊</h2>
                <p>扫码加入 TDG 群，活动报名、服务器信息和协作通知都会优先在群内同步。</p>
                <strong>群号：1055138703</strong>
              </div>
              <img src={asset('/概念设计图/TDG群二维码.jpg')} alt="TDG 群二维码" loading="lazy" />
            </article>
          </div>
        </div>
      </section>

      <Section id="overview" eyebrow="站点总览 OVERVIEW" title="功能模块">
        <div className="preview-grid">
          {previews.map((item) => (
            <button className="preview-link" key={item.route} onClick={() => go(item.route)}>
              <small>{item.meta ?? (item.count ? `${item.count} 项` : '暂无')}</small><strong>{item.label}</strong><p>{item.sub}</p><ChevronRight size={18} />
            </button>
          ))}
        </div>
      </Section>

    </main>
  );
}

/* ============================================================
   KNOWLEDGE / ARTICLES PAGE
   ============================================================ */
function KnowledgePage({ data }) {
  const [query, setQuery] = useState('');
  const docs = data.knowledge.filter((d) => `${d.title}${d.summary}${d.tags.join('')}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <PageShell eyebrow="文章 ARTICLES" title="知识库">
      <section className="content-section animated-section">
        <label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索文章标题、分类或标签" /></label>
        {docs.length ? (<div className="ak-grid two">{docs.map((doc) => (<article className="ak-card" key={doc.id}><small>{doc.category} / 外部链接</small><h3>{doc.title}</h3><p>{doc.summary}</p><div className="tag-row">{doc.tags.map((t) => <span key={t}>{t}</span>)}</div><a className="primary-action small" href={doc.url} target="_blank" rel="noreferrer">打开飞书文档 <ExternalLink size={14} /></a></article>))}</div>) : <Empty />}
      </section>
    </PageShell>
  );
}

/* ============================================================
   EVENTS PAGE
   ============================================================ */
function EventsPage({ data }) {
  const statusText = { UPCOMING: '即将开始', ONGOING: '进行中', FINISHED: '已结束' };
  return (
    <PageShell eyebrow="活动 EVENTS" title="活动公告">
      <section className="content-section animated-section">
        {data.events.length ? (<div className="ak-grid three">{data.events.map((event) => (<article className="ak-card" key={event.name}><small>{statusText[event.status] ?? event.status}</small><h3>{event.name}</h3><p>{event.description}</p><footer>{event.date} / {event.location}</footer>{event.actionUrl ? <a className="ghost-action small" href={event.actionUrl} target="_blank" rel="noreferrer">{event.actionLabel} <ExternalLink size={14} /></a> : null}</article>))}</div>) : <Empty />}
      </section>
    </PageShell>
  );
}

/* ============================================================
   FORUM PAGE — Sub-pages per board
   ============================================================ */
/* ============================================================
   FORUM DATA HOOKS
   ============================================================ */
const BOARDS = [
  { code: 'DEV', name: '游戏开发', desc: '引擎、玩法、系统设计、工程问题与开发日志。' },
  { code: 'TECH', name: '技术交流', desc: 'Unity、UE5、工具链、性能优化与疑难排查。' },
  { code: 'ART', name: '美术设计', desc: '概念设计、UI、动效、技术美术与资产生产。' },
  { code: 'TEAM', name: '项目招募', desc: '寻找策划、程序、美术、音频与制作协作者。' },
  { code: 'DROP', name: '资源分享', desc: '课程、工具、插件、模板和公开学习资料。' },
  { code: 'CHAT', name: '闲聊区', desc: '游戏体验、灵感碎片和不适合归类的信号。' }
];

function usePosts(board, sort) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    let q = supabase.from('posts').select('*, author:author_id(id,username,display_name,avatar_url)');
    if (board) q = q.eq('board', board);
    if (sort === 'hot') q = q.order('likes_count', { ascending: false }).order('comments_count', { ascending: false });
    else q = q.order('created_at', { ascending: false });
    q.range(0, 49).then(({ data }) => { setPosts(data || []); setLoading(false); });
  }, [board, sort]);
  return { posts, loading, setPosts };
}

function usePostDetail(postId) {
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  useEffect(() => {
    if (!postId) return;
    supabase.from('posts').select('*, author:author_id(id,username,display_name,avatar_url)').eq('id', postId).single().then(({ data }) => setPost(data));
    supabase.from('comments').select('*, author:author_id(id,username,display_name,avatar_url)').eq('post_id', postId).order('created_at', { ascending: true }).then(({ data }) => setComments(data || []));
  }, [postId]);
  return { post, comments, setComments };
}

/* ============================================================
   FORUM PAGE — Full Supabase-powered
   ============================================================ */
function ForumPage({ sub, user }) {
  const board = sub?.toUpperCase();
  const boardInfo = BOARDS.find(b => b.code === board);
  const [sort, setSort] = useState('hot');
  const { posts, loading } = usePosts(board, sort);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);

  if (detailId) return <PostDetailView postId={detailId} user={user} onBack={() => setDetailId(null)} />;
  if (showCreate) return <CreatePost user={user} board={board || 'CHAT'} onDone={() => setShowCreate(false)} />;

  return (
    <PageShell eyebrow="论坛 FORUM" title={boardInfo ? boardInfo.name : '社团论坛'}>
      <section className="content-section animated-section">
        <div className="forum-sub-nav">
          <button className={!board ? 'active' : ''} onClick={() => go('forum')}>所有帖子</button>
          {BOARDS.map((b) => (
            <button key={b.code} className={board === b.code ? 'active' : ''} onClick={() => go(`forum/${b.code.toLowerCase()}`)}>{b.code} {b.name}</button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div className="forum-sub-nav" style={{ marginBottom: 0 }}>
            <button className={sort === 'hot' ? 'active' : ''} onClick={() => setSort('hot')}>热门</button>
            <button className={sort === 'new' ? 'active' : ''} onClick={() => setSort('new')}>最新</button>
          </div>
          {user ? (
            <button className="primary-action small" onClick={() => setShowCreate(true)}>发新帖</button>
          ) : (
            <span style={{ fontSize: '0.82rem', color: 'var(--faint)' }}>登录后即可发帖</span>
          )}
        </div>
        {/* Board cards — show when no board selected */}
        {!board && !loading && (
          <div className="ak-grid three" style={{ marginBottom: 28 }}>
            {BOARDS.map((b) => (
              <button className="preview-link" key={b.code} onClick={() => go(`forum/${b.code.toLowerCase()}`)}>
                <small>{b.code}</small><strong>{b.name}</strong><p>{b.desc}</p><ChevronRight size={18} />
              </button>
            ))}
          </div>
        )}

        {loading ? <Empty /> : posts.length ? (
          <div>
            {posts.map((p) => (
              <button className="forum-post-item ak-card" key={p.id} onClick={() => setDetailId(p.id)} style={{ minHeight: 'auto', width: '100%', marginBottom: 8, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {p.author?.avatar_url && <img src={p.author.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />}
                  <small>{p.author?.display_name || p.author?.username || '匿名'}</small>
                  <small style={{ color: 'var(--faint)' }}>{new Date(p.created_at).toLocaleDateString('zh-CN')}</small>
                  <small style={{ marginLeft: 'auto' }}>{BOARDS.find(b => b.code === p.board)?.code || p.board}</small>
                </div>
                <strong style={{ fontSize: '1.05rem' }}>{p.title}</strong>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.8rem', color: 'var(--faint)' }}>
                  <span>❤ {p.likes_count || 0}</span>
                  <span>💬 {p.comments_count || 0}</span>
                </div>
              </button>
            ))}
          </div>
        ) : <Empty />}
      </section>
    </PageShell>
  );
}

/* ============================================================
   CREATE POST
   ============================================================ */
function CreatePost({ user, board, onDone }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selBoard, setSelBoard] = useState(board);
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  if (!user) return <PageShell eyebrow="" title=""><section className="content-section"><Empty /><p style={{textAlign:'center',color:'var(--faint)'}}>请先登录</p><button className="primary-action small" onClick={() => go('forum')} style={{margin:'12px auto',display:'block'}}>返回论坛</button></section></PageShell>;

  const doUpload = async (file) => {
    if (!file?.type?.startsWith('image/')) return;
    setUploading(true);
    const ext = file.name.split('.').pop().replace(/[^a-zA-Z0-9]/g, '');
    const name = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(name, file);
    setUploading(false);
    if (error) { alert('上传失败: ' + error.message); return null; }
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(name);
    return publicUrl;
  };

  const onFile = async (e) => {
    const url = await doUpload(e.target.files[0]);
    if (url) setContent(c => c + `\n![](${url})\n`);
  };

  const submit = async () => {
    if (!title.trim()) return alert('请输入标题');
    setSubmitting(true);
    const { error } = await supabase.from('posts').insert({
      title: title.trim(), content: content.trim(), board: selBoard,
      author_id: user.id, tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean)
    });
    setSubmitting(false);
    if (error) alert('发帖失败: ' + error.message);
    else onDone();
  };

  return (
    <PageShell eyebrow="发帖 NEW POST" title="发布新帖">
      <section className="content-section animated-section" style={{ maxWidth: 800 }}>
        <select className="board-select" value={selBoard} onChange={e => setSelBoard(e.target.value)}>
          {BOARDS.map(b => <option key={b.code} value={b.code}>{b.code} {b.name}</option>)}
        </select>
        <input className="post-input" placeholder="帖子标题" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="post-textarea" placeholder="帖子内容…（支持 Markdown）" rows={10} value={content} onChange={e => setContent(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="post-input" style={{ flex: 1, minWidth: 200 }} placeholder="标签（逗号分隔）" value={tags} onChange={e => setTags(e.target.value)} />
          <button className="ghost-action small" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '上传中…' : '上传图片'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary-action small" onClick={submit} disabled={submitting}>{submitting ? '发布中…' : '发布帖子'}</button>
          <button className="ghost-action small" onClick={onDone}>取消</button>
        </div>
      </section>
    </PageShell>
  );
}

/* ============================================================
   POST DETAIL + COMMENTS + LIKES
   ============================================================ */
function PostDetailView({ postId, user, onBack }) {
  const { post, comments, setComments } = usePostDetail(postId);
  const [commentText, setCommentText] = useState('');
  const [liked, setLiked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && postId) {
      supabase.from('likes').select('id').eq('post_id', postId).eq('user_id', user.id).single().then(({ data }) => setLiked(!!data));
    }
  }, [user, postId]);

  if (!post) return <PageShell eyebrow="" title=""><section className="content-section"><Empty /></section></PageShell>;

  const toggleLike = async () => {
    if (!user) return alert('请先登录');
    if (liked) {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id);
      setLiked(false);
    } else {
      await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
      setLiked(true);
    }
  };

  const addComment = async () => {
    if (!user) return alert('请先登录');
    if (!commentText.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('comments').insert({ post_id: postId, author_id: user.id, content: commentText.trim() }).select('*, author:author_id(id,username,display_name,avatar_url)').single();
    setSubmitting(false);
    if (error) alert('评论失败: ' + error.message);
    else { setComments(c => [...c, data]); setCommentText(''); }
  };

  const delPost = async () => {
    if (!confirm('确定删除此帖？')) return;
    await supabase.from('posts').delete().eq('id', postId);
    onBack();
  };

  const delComment = async (cid) => {
    if (!confirm('确定删除此评论？')) return;
    await supabase.from('comments').delete().eq('id', cid);
    setComments(c => c.filter(x => x.id !== cid));
  };

  return (
    <PageShell eyebrow="帖子 POST" title={post.title}>
      <section className="content-section animated-section" style={{ maxWidth: 800 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          {post.author?.avatar_url && <img src={post.author.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
          <div>
            <strong style={{ fontSize: '0.95rem' }}>{post.author?.display_name || post.author?.username || '匿名'}</strong>
            <small style={{ display: 'block', color: 'var(--faint)' }}>
              {BOARDS.find(b => b.code === post.board)?.name} · {new Date(post.created_at).toLocaleString('zh-CN')}
            </small>
          </div>
          {(user?.id === post.author_id || user?.isAdmin) && (
            <button className="icon-button" onClick={delPost} style={{ marginLeft: 'auto' }} title="删除帖子"><X size={14} /></button>
          )}
        </div>
        <div className="post-content" dangerouslySetInnerHTML={{ __html: post.content.replace(/\n/g, '<br/>').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:4px;margin:8px 0" />') }} />
        {post.tags?.length > 0 && (
          <div className="tag-row" style={{ marginTop: 16 }}>{post.tags.map(t => <span key={t}>{t}</span>)}</div>
        )}
        <div style={{ display: 'flex', gap: 12, margin: '20px 0', alignItems: 'center' }}>
          <button className={`icon-button${liked ? ' active' : ''}`} onClick={toggleLike}>
            ❤ {post.likes_count || 0}
          </button>
          <span style={{ color: 'var(--faint)', fontSize: '0.85rem' }}>💬 {comments.length} 条评论</span>
        </div>

        {/* Comments */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>评论</h3>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              {c.author?.avatar_url && <img src={c.author.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', marginTop: 2 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: '0.85rem' }}>{c.author?.display_name || c.author?.username || '匿名'}</strong>
                  <small style={{ color: 'var(--faint)' }}>{new Date(c.created_at).toLocaleString('zh-CN')}</small>
                  {(user?.id === c.author_id || user?.isAdmin) && (
                    <button className="icon-button" onClick={() => delComment(c.id)} style={{ marginLeft: 'auto', width: 26, height: 26 }}><X size={12} /></button>
                  )}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.9rem', lineHeight: 1.6 }}>{c.content}</p>
              </div>
            </div>
          ))}
          {user ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input className="post-input" style={{ flex: 1 }} placeholder="写评论…" value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addComment()} />
              <button className="primary-action small" onClick={addComment} disabled={submitting}>发送</button>
            </div>
          ) : (
            <p style={{ color: 'var(--faint)', fontSize: '0.85rem' }}>登录后即可评论</p>
          )}
        </div>

        <button className="ghost-action small" onClick={onBack} style={{ marginTop: 20 }}>← 返回列表</button>
      </section>
    </PageShell>
  );
}

/* ============================================================
   MEDIA PAGE
   ============================================================ */
function VideoDetailPage({ video }) {
  if (!video) {
    return (
      <PageShell eyebrow="视频 MEDIA" title="未找到视频">
        <section className="content-section video-detail">
          <button className="ghost-action small" onClick={() => go('media')}><ArrowLeft size={14} /> 返回视频中心</button>
          <Empty />
        </section>
      </PageShell>
    );
  }

  const src = videoSource(video);
  return (
    <PageShell eyebrow={`${video.category} / VIDEO`} title={video.title}>
      <section className="content-section video-detail">
        <button className="ghost-action small video-back" onClick={() => go('media')}><ArrowLeft size={14} /> 返回视频中心</button>
        {src ? (
          <video className="video-player" controls playsInline preload="metadata" poster={asset(video.poster)}>
            <source src={src} type="video/mp4" />
            你的浏览器不支持 HTML5 视频播放。
          </video>
        ) : (
          <div className="video-unavailable">
            <Film size={28} />
            <strong>视频地址尚未配置</strong>
            <span>请在 GitHub 仓库变量中设置 VITE_MEDIA_BASE_URL。</span>
          </div>
        )}
        <div className="video-meta">
          <span>{video.duration}</span>
          <span>{video.resolution}</span>
          <span>{video.publishedAt}</span>
        </div>
        <p className="video-description">{video.description}</p>
      </section>
    </PageShell>
  );
}

function MediaPage({ data, sub }) {
  if (sub) {
    const video = data.media.find((item) => item.id === decodeURIComponent(sub));
    return <VideoDetailPage video={video} />;
  }

  return (
    <PageShell eyebrow="视频 MEDIA" title="视频中心">
      <section className="content-section animated-section">
        {data.media.length ? (
          <div className="video-grid">
            {data.media.map((video) => (
              <article className="ak-card video-card" key={video.id}>
                <button className="video-thumb" onClick={() => go(`media/${video.id}`)} aria-label={`播放 ${video.title}`}>
                  <img src={asset(video.poster)} alt="" loading="lazy" />
                  <span className="video-play"><Play size={22} fill="currentColor" /></span>
                  <span className="video-duration">{video.duration}</span>
                </button>
                <div className="video-card-copy">
                  <small>{video.category}</small>
                  <h3>{video.title}</h3>
                  <p>{video.description}</p>
                  <button className="primary-action small" onClick={() => go(`media/${video.id}`)}><Play size={14} /> 播放视频</button>
                </div>
              </article>
            ))}
          </div>
        ) : <Empty />}
      </section>
    </PageShell>
  );
}

/* ============================================================
   RESOURCES PAGE
   ============================================================ */
function ResourcesPage({ data }) {
  return (
    <PageShell eyebrow="资源 RESOURCES" title="资源中心">
      <section className="content-section animated-section">
        {data.resources.length ? (<div className="ak-grid two">{data.resources.map((r) => (<article className="ak-card" key={r.name}><small>{r.type}</small><h3>{r.name}</h3><footer>下载次数 {r.downloads}</footer>{r.url ? <a className="primary-action small" href={r.url} target="_blank" rel="noreferrer">打开资源 <ExternalLink size={14} /></a> : <span className="primary-action small" style={{ opacity: 0.4, pointerEvents: 'none' }}>暂无链接</span>}</article>))}</div>) : <Empty />}
      </section>
      <Section eyebrow="工具 TOOLS" title="AI 工具导航">
        {data.tools.length ? (<div className="ak-grid three">{data.tools.map((t) => (<a className="ak-card" href={t.url} target="_blank" rel="noreferrer" key={t.name}><small>{t.category}</small><h3>{t.name}</h3></a>))}</div>) : <Empty />}
      </Section>
    </PageShell>
  );
}

/* ============================================================
   MUSIC PAGE
   ============================================================ */
function MusicPage({ data }) {
  return (
    <PageShell eyebrow="音乐 MUSIC" title="音乐库">
      <section className="content-section animated-section">
        {data.music.length ? (<div className="ak-grid two">{data.music.map((track, i) => (<article className="ak-card" key={track.src}><small>{String(i + 1).padStart(2, '0')}</small><h3>{track.title}</h3><p>{track.artist} / {track.album}</p></article>))}</div>) : <Empty />}
      </section>
    </PageShell>
  );
}

/* ============================================================
   PROFILE PAGE
   ============================================================ */
function useUserActivity(user) {
  const [activity, setActivity] = useState({ loading: false, profile: null, posts: [], comments: [], replies: [] });

  useEffect(() => {
    let alive = true;
    if (!user) {
      setActivity({ loading: false, profile: null, posts: [], comments: [], replies: [] });
      return () => { alive = false; };
    }

    setActivity((current) => ({ ...current, loading: true }));
    (async () => {
      const [profileRes, postsRes, commentsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('posts').select('id,title,board,likes_count,comments_count,created_at').eq('author_id', user.id).order('created_at', { ascending: false }),
        supabase.from('comments').select('id,content,created_at,post:post_id(id,title,board)').eq('author_id', user.id).order('created_at', { ascending: false }).limit(30)
      ]);

      const posts = postsRes.data || [];
      let replies = [];
      if (posts.length) {
        const { data } = await supabase
          .from('comments')
          .select('id,content,created_at,author:author_id(id,username,display_name,avatar_url),post:post_id(id,title,board)')
          .in('post_id', posts.map((post) => post.id))
          .neq('author_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30);
        replies = data || [];
      }

      if (alive) setActivity({ loading: false, profile: profileRes.data || null, posts, comments: commentsRes.data || [], replies });
    })();

    return () => { alive = false; };
  }, [user?.id]);

  return activity;
}

function ProfilePage({ user, onLogin }) {
  const activity = useUserActivity(user);
  const displayName = activity.profile?.display_name || user?.name || user?.login || 'TDG 成员';
  const avatar = activity.profile?.avatar_url || user?.avatar;
  const likesReceived = activity.posts.reduce((sum, post) => sum + (post.likes_count || 0), 0);
  const stats = [
    { label: '发帖记录', value: activity.posts.length, icon: FileText },
    { label: '评论记录', value: activity.comments.length, icon: MessageSquare },
    { label: '获赞量', value: likesReceived, icon: Heart },
    { label: '回复你的', value: activity.replies.length, icon: Bell }
  ];
  const formatTime = (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '';

  return (
    <PageShell eyebrow="个人 PROFILE" title="个人主页">
      {!user ? (
        <section className="content-section animated-section">
          <article className="admin-card profile-auth">
            <User size={28} />
            <h3>需要登录</h3>
            <p>登录后可查看个人信息、发帖记录、评论记录、获赞量和回复你的消息。</p>
            <button className="primary-action small" onClick={onLogin}>GitHub 登录</button>
          </article>
        </section>
      ) : (
        <>
          <section className="content-section animated-section">
            <article className="profile-hero-card">
              <div className="profile-identity">
                {avatar ? <img src={avatar} alt="" /> : <span><User size={30} /></span>}
                <div>
                  <small>{user.isAdmin ? '管理员 / ADMIN' : '成员 / MEMBER'}</small>
                  <h2>{displayName}</h2>
                  <p>@{user.login}</p>
                </div>
              </div>
              <p>这里汇总你在 TDG 网站中的社区活动。后续可继续接入收藏、私信、个人作品集和活动报名记录。</p>
            </article>
            <div className="profile-stats">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return <article className="admin-card" key={stat.label}><small>{stat.label}</small><Icon size={22} /><h3>{stat.value}</h3></article>;
              })}
            </div>
          </section>
          <Section eyebrow="发帖 POSTS" title="我的发帖">
            {activity.loading ? <Empty compact /> : activity.posts.length ? (
              <div className="profile-list">{activity.posts.slice(0, 8).map((post) => (
                <button className="ak-card profile-list-item" key={post.id} onClick={() => go('forum')}>
                  <small>{BOARDS.find((b) => b.code === post.board)?.name || post.board} / {formatTime(post.created_at)}</small>
                  <h3>{post.title}</h3>
                  <footer>❤ {post.likes_count || 0} / 评论 {post.comments_count || 0}</footer>
                </button>
              ))}</div>
            ) : <Empty />}
          </Section>
          <Section eyebrow="评论 COMMENTS" title="我的评论">
            {activity.loading ? <Empty compact /> : activity.comments.length ? (
              <div className="profile-list">{activity.comments.slice(0, 8).map((comment) => (
                <article className="ak-card profile-list-item" key={comment.id}>
                  <small>{comment.post?.title || '帖子'} / {formatTime(comment.created_at)}</small>
                  <p>{comment.content}</p>
                </article>
              ))}</div>
            ) : <Empty />}
          </Section>
          <Section eyebrow="消息 REPLIES" title="回复你的">
            {activity.loading ? <Empty compact /> : activity.replies.length ? (
              <div className="profile-list">{activity.replies.slice(0, 8).map((reply) => (
                <article className="ak-card profile-list-item" key={reply.id}>
                  <small>{reply.author?.display_name || reply.author?.username || '匿名'} 回复了《{reply.post?.title || '帖子'}》</small>
                  <p>{reply.content}</p>
                  <footer>{formatTime(reply.created_at)}</footer>
                </article>
              ))}</div>
            ) : <Empty />}
          </Section>
          <Section eyebrow="入口 SHORTCUTS" title="常用入口">
            <div className="preview-grid">
              <button className="preview-link" onClick={() => go('forum')}><small>FORUM</small><strong>进入论坛</strong><p>发帖、评论或查看社团讨论。</p><ChevronRight size={18} /></button>
              <button className="preview-link" onClick={() => go('events')}><small>EVENTS</small><strong>查看活动</strong><p>关注 MC 暑期服务器和后续活动。</p><ChevronRight size={18} /></button>
              <button className="preview-link" onClick={() => go('knowledge')}><small>ARTICLES</small><strong>进入文章库</strong><p>查看飞书文档与设计笔记。</p><ChevronRight size={18} /></button>
            </div>
          </Section>
        </>
      )}
    </PageShell>
  );
}

/* ============================================================
   MUSIC PLAYER — Auto-play immediately, ElasticSlider volume
   ============================================================ */
function MusicPlayer({ tracks }) {
  const audioRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const current = tracks[index];
  const interactedRef = useRef(false);

  // Auto-play on first user interaction
  useEffect(() => {
    if (!current) return;
    const audio = audioRef.current;
    if (!audio) return;
    const tryPlay = () => {
      if (interactedRef.current) return;
      interactedRef.current = true;
      audio.volume = volume;
      audio.play().then(() => setPlaying(true)).catch(() => {});
    };
    const events = ['click', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, tryPlay, { once: true }));
    return () => events.forEach(e => window.removeEventListener(e, tryPlay));
  }, []);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    if (playing && audioRef.current && current) { audioRef.current.play().catch(() => setPlaying(false)); }
  }, [index, current, playing]);

  function selectTrack(i) { setIndex(i); setPlaylistOpen(false); }
  function next() { if (!tracks.length) return; setIndex((v) => shuffle ? Math.floor(Math.random() * tracks.length) : (v + 1) % tracks.length); }
  function prev() { if (!tracks.length) return; setIndex((v) => (v - 1 + tracks.length) % tracks.length); }
  function toggle() {
    if (!audioRef.current || !current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  }

  return (
    <div className="player-wrapper">
      {/* Playlist panel — outside clip-path */}
      {playlistOpen && (
        <div className="playlist-panel">
          <div className="playlist-header">
            <span>歌曲列表</span>
            <button className="icon-button" onClick={() => setPlaylistOpen(false)} aria-label="关闭列表"><X size={14} /></button>
          </div>
          <div className="playlist-tracks">
            {tracks.length ? tracks.map((track, i) => (
              <button
                key={track.src}
                className={`playlist-track${i === index ? ' active' : ''}`}
                onClick={() => selectTrack(i)}
              >
                <span className="playlist-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="playlist-title">{track.title}</span>
                <span className="playlist-artist">{track.artist}</span>
                {i === index && <span className="playlist-now">正在播放</span>}
              </button>
            )) : <div className="playlist-empty">暂无曲目</div>}
          </div>
        </div>
      )}

      <aside className="floating-player">
        <audio ref={audioRef} src={asset(current?.src)} loop={repeat} onEnded={next} preload="auto" />
        <div className="player-info">
          <Disc3 className={playing ? 'spin' : ''} size={18} />
          <div><small>全局音乐</small><strong>{current?.title ?? '暂无曲目'}</strong></div>
        </div>
        <div className="player-controls">
          <button className="icon-button" onClick={prev} aria-label="上一首"><SkipBack size={14} /></button>
          <button className="icon-button main-play" onClick={toggle} aria-label="播放 / 暂停">{playing ? <Pause size={15} /> : <Play size={15} />}</button>
          <button className="icon-button" onClick={next} aria-label="下一首"><SkipForward size={14} /></button>
          <button className={`icon-button${shuffle ? ' active' : ''}`} onClick={() => setShuffle(!shuffle)} aria-label="随机"><Shuffle size={13} /></button>
          <button className={`icon-button${repeat ? ' active' : ''}`} onClick={() => setRepeat(!repeat)} aria-label="循环"><Repeat size={13} /></button>
          <button className={`icon-button${playlistOpen ? ' active' : ''}`} onClick={() => setPlaylistOpen(!playlistOpen)} aria-label="歌曲列表"><ListMusic size={14} /></button>
        </div>
        <div className="player-slider">
          <ElasticSlider
            defaultValue={Math.round(volume * 100)}
            maxValue={100}
            leftIcon={<Volume2 size={14} />}
            rightIcon={<Volume2 size={16} />}
            onChange={(v) => setVolume(v / 100)}
          />
        </div>
      </aside>
    </div>
  );
}

/* ============================================================
   APP ROOT
   ============================================================ */
function App() {
  const { route, sub } = useRoute();
  const { data, loading } = useContent();
  const { user, login, logout } = useSupabaseAuth();
  const mobileMode = useMobileMode();
  const activeRoute = routeMap[route] ? route : 'home';
  useGsapPage(activeRoute, loading);

  const page = useMemo(() => {
    if (loading) return <div className="loading">载入中</div>;
    const props = { data };
    switch (activeRoute) {
      case 'knowledge': return <KnowledgePage {...props} />;
      case 'events': return <EventsPage {...props} />;
      case 'forum': return <ForumPage sub={sub} user={user} />;
      case 'media': return <MediaPage {...props} sub={sub} />;
      case 'music': return <MusicPage {...props} />;
      case 'resources': return <ResourcesPage {...props} />;
      case 'profile': return <ProfilePage user={user} onLogin={login} />;
      default: return <HomePage {...props} />;
    }
  }, [activeRoute, sub, data, loading, user, login]);

  return (
    <ClickSpark sparkColor="#EF4444" sparkSize={20} sparkRadius={30} sparkCount={10} duration={400} disabled={mobileMode}>
      {!mobileMode && <PixelSnow color="#e8eef4" flakeSize={0.008} pixelResolution={800} speed={0.7} density={0.22} variant="snowflake" direction={130} brightness={0.65} />}
      <TopNav route={activeRoute} user={user} onLogin={login} onLogout={logout} />
      {page}
      {activeRoute !== 'media' && <MusicPlayer tracks={data.music} />}
    </ClickSpark>
  );
}

createRoot(document.getElementById('root')).render(<App />);
