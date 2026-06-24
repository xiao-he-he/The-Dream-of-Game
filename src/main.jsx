import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import {
  Color, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer
} from 'three';
import {
  Archive, BookOpen, CalendarDays, ChevronRight, Disc3, Download, Expand, ExternalLink,
  FileText, Film, Home, LayoutDashboard, Lock, Maximize, MessageSquare, Minimize,
  Music2, Pause, Play, Repeat, Search, Shuffle, SkipBack, SkipForward, User, Volume2, X, ZoomIn, ZoomOut, ListMusic
} from 'lucide-react';
import './styles.css';

gsap.registerPlugin(ScrollTrigger);

/* ============================================================
   BASE PATH — works in dev (/) and GitHub Pages (/The-Dream-of-Game/)
   ============================================================ */
const BASE = import.meta.env.BASE_URL;

/* ============================================================
   CONTENT CONFIG
   ============================================================ */
const contentFiles = {
  archive: `${BASE}content/archive/highlights.json`,
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

const routeMap = { home: '首页', archive: '档案', knowledge: '文章', events: '活动', forum: '论坛', media: '视频', music: '音乐', resources: '资源', admin: '后台' };

const navItems = [
  { route: 'home', label: '首页', sub: 'HOME', icon: Home },
  { route: 'archive', label: '档案', sub: 'ARCHIVE', icon: Archive },
  { route: 'knowledge', label: '文章', sub: 'ARTICLES', icon: BookOpen },
  { route: 'events', label: '活动', sub: 'EVENTS', icon: CalendarDays },
  { route: 'forum', label: '论坛', sub: 'FORUM', icon: MessageSquare },
  { route: 'media', label: '视频', sub: 'MEDIA', icon: Film },
  { route: 'music', label: '音乐', sub: 'MUSIC', icon: Music2 },
  { route: 'resources', label: '资源', sub: 'RESOURCES', icon: FileText },
  { route: 'admin', label: '后台', sub: 'ADMIN', icon: LayoutDashboard }
];

const emptyData = { archive:[], knowledge:[], events:[], forum:[], media:[], music:[], members:[], projects:[], resources:[], tools:[], stats:[], integrations:{links:[]}, giscus:{} };

// Helper: prepend BASE to internal paths, leave external URLs alone
const asset = (path) => (!path || path.startsWith('http') ? path : `${BASE}${path.replace(/^\//, '')}`);

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

function useLocalStorage(key, iv) {
  const [v, sv] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? iv; } catch { return iv; } });
  useEffect(() => localStorage.setItem(key, JSON.stringify(v)), [key, v]);
  return [v, sv];
}

/* ============================================================
   GITHUB OAUTH — PKCE flow, no server needed
   ============================================================ */
const GITHUB_CLIENT_ID = 'Ov23lisHSUn5o5ECAyvL';
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
// Cloudflare Worker OAuth 代理（待部署）
const OAUTH_PROXY = 'https://tdg-oauth.202412063035.workers.dev/token';
const GITHUB_USER_URL = 'https://api.github.com/user';

function base64URL(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function sha256(plain) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain)); }
async function pkceChallenge(verifier) { return base64URL(await sha256(verifier)); }
function randomString(len) { return base64URL(crypto.getRandomValues(new Uint8Array(len))); }

function useGitHubAuth() {
  const [user, setUser] = useLocalStorage('tdg-gh-user', null);
  const [authStatus, setAuthStatus] = useState(null); // null | 'processing' | 'error'

  // Handle OAuth callback — check immediately, not just in useEffect
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const hasCode = !!code;

  useEffect(() => {
    if (!code) return;
    // Don't check `user` here — just process the code regardless
    const verifier = sessionStorage.getItem('tdg-pkce-verifier');
    if (!verifier) {
      // Clean URL even if no verifier (stale code)
      const url = new URL(window.location);
      url.searchParams.delete('code'); url.searchParams.delete('state');
      window.history.replaceState({}, '', url);
      return;
    }
    sessionStorage.removeItem('tdg-pkce-verifier');
    setAuthStatus('processing');

    (async () => {
      try {
        // Step 1: Exchange code for token via Cloudflare Worker
        const tokenRes = await fetch(OAUTH_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID, code,
            redirect_uri: (window.location.origin + BASE).replace(/\/$/, ''),
            code_verifier: verifier
          })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

        // Step 2: Fetch user info (GitHub API supports CORS)
        const userRes = await fetch(GITHUB_USER_URL, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const userData = await userRes.json();
        if (userData.message) throw new Error(userData.message);

        // Step 3: Save user
        setUser({
          login: userData.login, name: userData.name || userData.login,
          avatar: userData.avatar_url, isAdmin: userData.login === 'xiao-he-he',
          token: tokenData.access_token
        });
        setAuthStatus(null);

        // Clean URL
        const url = new URL(window.location);
        url.searchParams.delete('code'); url.searchParams.delete('state');
        window.history.replaceState({}, '', url);
      } catch (err) {
        console.error('OAuth failed:', err);
        setAuthStatus('error');
        // Clean URL after 3s
        setTimeout(() => {
          const url = new URL(window.location);
          url.searchParams.delete('code'); url.searchParams.delete('state');
          window.history.replaceState({}, '', url);
          setAuthStatus(null);
        }, 3000);
      }
    })();
  }, []); // Run once on mount

  const login = async () => {
    const verifier = randomString(64);
    sessionStorage.setItem('tdg-pkce-verifier', verifier);
    const challenge = await pkceChallenge(verifier);
    const redirectUri = (window.location.origin + BASE).replace(/\/$/, '');
    window.location.href = `${GITHUB_AUTH_URL}?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user&state=tdg&code_challenge=${challenge}&code_challenge_method=S256`;
  };

  const logout = () => setUser(null);

  return { user, authStatus, login, logout };
}

/* ============================================================
   CLICK SPARK — 鼠标动效.md
   sparkColor="#fff" sparkSize={10} sparkRadius={15} sparkCount={8} duration={400}
   ============================================================ */
function ClickSpark({ sparkColor = '#EF4444', sparkSize = 20, sparkRadius = 30, sparkCount = 10, duration = 400, children }) {
  const canvasRef = useRef(null);
  const sparksRef = useRef([]);
  useEffect(() => {
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
  }, [sparkColor, sparkSize, sparkRadius, sparkCount, duration]);
  const onClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const now = performance.now();
    sparksRef.current.push(...Array.from({ length: sparkCount }, (_, i) => ({
      x: e.clientX - rect.left, y: e.clientY - rect.top,
      startTime: now, angle: (2 * Math.PI * i) / sparkCount
    })));
  }, [sparkCount]);
  return <div className="click-spark" onClick={onClick}><canvas ref={canvasRef} />{children}</div>;
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

  const vv = useMemo(() => variant === 'round' ? 1.0 : variant === 'snowflake' ? 2.0 : 0.0, [variant]);
  const cv = useMemo(() => { const c = new Color(color); return new Vector3(c.r, c.g, c.b); }, [color]);

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
    const scene = new Scene();
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(c.offsetWidth, c.offsetHeight);
    renderer.setClearColor(0x000000, 0);
    c.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const mat = new ShaderMaterial({
      vertexShader: PV, fragmentShader: PF,
      uniforms: {
        uTime: { value: 0 }, uResolution: { value: new Vector2(c.offsetWidth, c.offsetHeight) },
        uFlakeSize: { value: flakeSize }, uMinFlakeSize: { value: minFlakeSize },
        uPixelResolution: { value: pixelResolution }, uSpeed: { value: speed },
        uDepthFade: { value: depthFade }, uFarPlane: { value: farPlane },
        uColor: { value: cv.clone() }, uBrightness: { value: brightness },
        uGamma: { value: gamma }, uDensity: { value: density },
        uVariant: { value: vv }, uDirection: { value: (direction * Math.PI) / 180 }
      }, transparent: true
    });
    materialRef.current = mat;
    scene.add(new Mesh(new PlaneGeometry(2, 2), mat));
    window.addEventListener('resize', handleResize);

    const st = performance.now();
    const anim = () => {
      animRef.current = requestAnimationFrame(anim);
      if (visibleRef.current) { mat.uniforms.uTime.value = (performance.now() - st) * 0.001; renderer.render(scene, cam); }
    };
    anim();
    return () => {
      cancelAnimationFrame(animRef.current); window.removeEventListener('resize', handleResize);
      if (rtRef.current) clearTimeout(rtRef.current);
      if (c.contains(renderer.domElement)) c.removeChild(renderer.domElement);
      renderer.dispose(); renderer.forceContextLoss(); mat.dispose();
      rendererRef.current = null; materialRef.current = null;
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
    m.uniforms.uColor.value.copy(cv);
  }, [flakeSize, minFlakeSize, pixelResolution, speed, depthFade, farPlane, brightness, gamma, density, vv, direction, cv]);

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

/* ============================================================
   ELASTIC SLIDER — 音量动效.md
   ============================================================ */
const MAX_OVERFLOW = 50;
function decay(value, max) {
  if (max === 0) return 0;
  const entry = value / max;
  return (2 * (1 / (1 + Math.exp(-entry)) - 0.5)) * max;
}

function ElasticSlider({ defaultValue = 50, startingValue = 0, maxValue = 100, isStepped = false, stepSize = 1, leftIcon, rightIcon, onChange }) {
  const [value, setValue] = useState(defaultValue);
  const sliderRef = useRef(null);
  const [region, setRegion] = useState('middle');
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);

  useEffect(() => { setValue(defaultValue); }, [defaultValue]);
  useEffect(() => { onChange?.(value); }, [value, onChange]);

  useMotionValueEvent(clientX, 'change', latest => {
    if (sliderRef.current) {
      const { left, right } = sliderRef.current.getBoundingClientRect();
      let newValue;
      if (latest < left) { setRegion('left'); newValue = left - latest; }
      else if (latest > right) { setRegion('right'); newValue = latest - right; }
      else { setRegion('middle'); newValue = 0; }
      overflow.jump(decay(newValue, MAX_OVERFLOW));
    }
  });

  const handlePointerMove = e => {
    if (e.buttons > 0 && sliderRef.current) {
      const { left, width } = sliderRef.current.getBoundingClientRect();
      let newValue = startingValue + ((e.clientX - left) / width) * (maxValue - startingValue);
      if (isStepped) newValue = Math.round(newValue / stepSize) * stepSize;
      newValue = Math.min(Math.max(newValue, startingValue), maxValue);
      setValue(newValue); clientX.jump(e.clientX);
    }
  };

  const getRangePercentage = () => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;
    return ((value - startingValue) / totalRange) * 100;
  };

  return (
    <div className="elastic-slider">
      <motion.div
        onHoverStart={() => animate(scale, 1.2)}
        onHoverEnd={() => animate(scale, 1)}
        style={{ scale, opacity: useTransform(scale, [1, 1.2], [0.7, 1]) }}
        className="elastic-slider-wrap"
      >
        <motion.div
          animate={{ scale: region === 'left' ? [1, 1.4, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: useTransform(() => region === 'left' ? -overflow.get() / scale.get() : 0) }}
        >
          <span className="elastic-slider-icon">{leftIcon}</span>
        </motion.div>
        <div ref={sliderRef} className="elastic-slider-root"
          onPointerMove={handlePointerMove}
          onPointerDown={e => { handlePointerMove(e); e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerUp={() => animate(overflow, 0, { type: 'spring', bounce: 0.5 })}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => sliderRef.current ? 1 + overflow.get() / sliderRef.current.getBoundingClientRect().width : 1),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => sliderRef.current ? (clientX.get() < sliderRef.current.getBoundingClientRect().left + sliderRef.current.getBoundingClientRect().width / 2 ? 'right' : 'left') : 'left'),
              height: useTransform(scale, [1, 1.2], [4, 10]),
              marginTop: useTransform(scale, [1, 1.2], [0, -3]),
              marginBottom: useTransform(scale, [1, 1.2], [0, -3])
            }}
            className="elastic-slider-track-wrap"
          >
            <div className="elastic-slider-track">
              <div className="elastic-slider-range" style={{ width: `${getRangePercentage()}%` }} />
            </div>
          </motion.div>
        </div>
        <motion.div
          animate={{ scale: region === 'right' ? [1, 1.4, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: useTransform(() => region === 'right' ? overflow.get() / scale.get() : 0) }}
        >
          <span className="elastic-slider-icon">{rightIcon}</span>
        </motion.div>
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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let ctx = null;
    const timer = window.setTimeout(() => {
      ctx = gsap.context(() => {
        const isHome = route === 'home';

        // === OPENING MASK (all pages, ~4s total sequence) ===
        const mask = document.querySelector(isHome ? '.opening-mask' : '.opening-mask-sub');
        if (mask) {
          gsap.fromTo(mask,
            { yPercent: 0 },
            { yPercent: -105, duration: isHome ? 0.4 : 0.35, ease: 'power4.inOut' }
          );
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

    return () => { clearTimeout(timer); if (ctx) ctx.revert(); };
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
          <button onClick={onLogin}><Lock size={15} />GitHub 登录</button>
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
    { route: 'knowledge', label: '文章知识库', sub: '飞书文档与站内 PDF 阅读', count: data.knowledge.length },
    { route: 'events', label: '活动公告', sub: '报名、日历与活动回顾', count: data.events.length },
    { route: 'forum', label: '社团论坛', sub: '技术交流、项目招募与讨论', count: data.forum.length },
    { route: 'media', label: '视频中心', sub: 'Bilibili 合集与录像归档', count: data.media.length },
    { route: 'resources', label: '资源中心', sub: '模板、资料与工具导航', count: data.resources.length },
    { route: 'admin', label: '管理后台', sub: '内容管理与协作工具', count: data.members.length }
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
            <p>面向游戏开发、视觉设计、技术美术与项目协作的社团数字基地。我们记录知识，组织活动，保存作品，连接正在创造游戏的人。</p>
            <div className="hero-actions">
              <button className="primary-action" onClick={() => go('knowledge')}>进入文章库</button>
              <button className="ghost-action" onClick={() => go('forum')}>进入论坛</button>
            </div>
          </div>
          <div className="hero-index">
            {data.stats.slice(0, 4).map((stat, index) => (
              <div key={stat.label}><small>{String(index + 1).padStart(2, '0')}</small><strong>{stat.value}</strong><span>{stat.label}</span></div>
            ))}
          </div>
        </div>
      </section>

      <Section id="overview" eyebrow="站点总览 OVERVIEW" title="功能模块">
        <div className="preview-grid">
          {previews.map((item) => (
            <button className="preview-link" key={item.route} onClick={() => go(item.route)}>
              <small>{item.count ? `${item.count} 项` : '暂无'}</small><strong>{item.label}</strong><p>{item.sub}</p><ChevronRight size={18} />
            </button>
          ))}
        </div>
      </Section>

      <Section id="archive-preview" eyebrow="社团定位 POSITION" title="我们保存创作过程，也推动作品发生">
        <div className="ak-grid three">
          {data.archive.map((item) => (
            <article className="ak-card" key={item.id}><small>{item.code}</small><h3>{item.title}</h3><p>{item.description}</p></article>
          ))}
        </div>
      </Section>
    </main>
  );
}

/* ============================================================
   ARCHIVE PAGE
   ============================================================ */
function ArchivePage({ data }) {
  return (
    <PageShell eyebrow="档案 ARCHIVE" title="社团档案">
      <section className="content-section animated-section">
        <div className="ak-grid three">{data.archive.map((item) => (<article className="ak-card" key={item.id}><small>{item.code}</small><h3>{item.title}</h3><p>{item.description}</p></article>))}</div>
      </section>
      <Section eyebrow="项目 PROJECTS" title="项目库">
        {data.projects.length ? (<div className="ak-grid three">{data.projects.map((p) => (<article className="ak-card" key={p.name}><small>{p.status}</small><h3>{p.name}</h3><p>{p.description}</p><div className="progress-track"><span style={{ width: `${p.progress}%` }} /></div><footer>{p.owner} / {p.stack.join('、')}</footer></article>))}</div>) : <Empty />}
      </Section>
    </PageShell>
  );
}

/* ============================================================
   KNOWLEDGE / ARTICLES PAGE
   ============================================================ */
function KnowledgePage({ data }) {
  const [query, setQuery] = useState('');
  const [activeDoc, setActiveDoc] = useState(null);
  const docs = data.knowledge.filter((d) => `${d.title}${d.summary}${d.tags.join('')}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <PageShell eyebrow="文章 ARTICLES" title="知识库">
      <section className="content-section animated-section">
        <label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索文章标题、分类或标签" /></label>
        {docs.length ? (<div className="ak-grid two">{docs.map((doc) => (<article className="ak-card" key={doc.id}><small>{doc.category}{doc.type === 'pdf' ? ' / 站内阅读' : ' / 外部链接'}</small><h3>{doc.title}</h3><p>{doc.summary}</p><div className="tag-row">{doc.tags.map((t) => <span key={t}>{t}</span>)}</div>{doc.type === 'pdf' ? <button className="primary-action small" onClick={() => setActiveDoc(doc)}>站内阅读</button> : <a className="primary-action small" href={doc.url} target="_blank" rel="noreferrer">打开飞书文档 <ExternalLink size={14} /></a>}</article>))}</div>) : <Empty />}
      </section>
      {activeDoc && <PdfReader doc={activeDoc} onClose={() => setActiveDoc(null)} />}
    </PageShell>
  );
}

/* ============================================================
   PDF READER — Fullscreen + resize buttons
   ============================================================ */
function PdfReader({ doc, onClose }) {
  const backdropRef = useRef(null);
  const [size, setSize] = useState('normal'); // 'normal' | 'large' | 'fullscreen' | 'compact'
  const [fs, setFs] = useState(false);
  const pdfUrl = asset(doc.url);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (fs) { setFs(false); setSize('normal'); } else onClose(); } };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = fs ? 'hidden' : '';

    // Hide nav & player when fullscreen
    const nav = document.querySelector('.top-nav');
    const player = document.querySelector('.floating-player');
    if (fs) {
      if (nav) nav.style.display = 'none';
      if (player) player.style.display = 'none';
    } else {
      if (nav) nav.style.display = '';
      if (player) player.style.display = '';
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (nav) nav.style.display = '';
      if (player) player.style.display = '';
    };
  }, [onClose, fs]);

  const sizeClass = fs ? 'fullscreen' : size === 'large' ? 'size-large' : size === 'compact' ? 'size-compact' : '';

  const toggleFs = () => { setFs(!fs); if (!fs) setSize('normal'); };
  const cycleSize = () => {
    const sizes = ['normal', 'large', 'compact'];
    const idx = sizes.indexOf(size);
    setSize(sizes[(idx + 1) % sizes.length]);
  };

  const backdropStyle = fs ? { zIndex: 9999, padding: 0, background: 'rgba(0,0,0,0.95)' } : undefined;

  return (
    <div className="reader-backdrop" ref={backdropRef} style={backdropStyle} onClick={(e) => { if (e.target === backdropRef.current && !fs) onClose(); }}>
      <section className={`pdf-reader ${sizeClass}`} style={fs ? { zIndex: 10000, position: 'fixed', inset: 0, width: '100vw', height: '100vh', clipPath: 'none' } : undefined}>
        <header>
          <div><small>站内 PDF 阅读</small><h2>{doc.title}</h2></div>
          <div className="header-actions">
            <button className="icon-button" onClick={cycleSize} aria-label="调整尺寸" title="切换尺寸"><ZoomOut size={16} /></button>
            <button className="icon-button" onClick={toggleFs} aria-label="全屏" title="全屏阅读">{fs ? <Minimize size={16} /> : <Maximize size={16} />}</button>
            <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={16} /></button>
          </div>
        </header>
        <object data={`${pdfUrl}#view=FitH&toolbar=0`} type="application/pdf" style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}>
          <iframe title={doc.title} src={`${pdfUrl}#view=FitH&toolbar=0&navpanes=0`} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} loading="lazy">
            <div className="pdf-fallback"><FileText size={48} /><p>您的浏览器不支持内嵌 PDF 阅读。请下载文件后使用本地阅读器查看。</p><a className="primary-action small" href={pdfUrl} download><Download size={15} /> 下载 PDF</a></div>
          </iframe>
        </object>
        <footer><span>如无法加载，可下载后使用本地阅读器查看。</span><a href={pdfUrl} download><Download size={14} /> 下载</a></footer>
      </section>
    </div>
  );
}

/* ============================================================
   EVENTS PAGE
   ============================================================ */
function EventsPage({ data }) {
  return (
    <PageShell eyebrow="活动 EVENTS" title="活动公告">
      <section className="content-section animated-section">
        {data.events.length ? (<div className="ak-grid three">{data.events.map((event) => (<article className="ak-card" key={event.name}><small>{event.status === 'UPCOMING' ? '即将开始' : '已结束'}</small><h3>{event.name}</h3><p>{event.description}</p><footer>{event.date} / {event.location}</footer>{event.actionUrl ? <a className="ghost-action small" href={event.actionUrl} target="_blank" rel="noreferrer">{event.actionLabel} <ExternalLink size={14} /></a> : null}</article>))}</div>) : <Empty />}
      </section>
    </PageShell>
  );
}

/* ============================================================
   FORUM PAGE — Sub-pages per board
   ============================================================ */
function ForumPage({ data, sub }) {
  const boards = data.forum;
  const activeBoard = sub ? boards.find(b => b.code.toLowerCase() === sub.toLowerCase()) : null;

  return (
    <PageShell eyebrow="论坛 FORUM" title={activeBoard ? `${activeBoard.name}` : '社团论坛'}>
      <section className="content-section animated-section">
        <div className="forum-sub-nav">
          <button className={!sub ? 'active' : ''} onClick={() => go('forum')}>所有帖子</button>
          {boards.map((board) => (
            <button key={board.code} className={sub === board.code.toLowerCase() ? 'active' : ''} onClick={() => go(`forum/${board.code.toLowerCase()}`)}>
              {board.code} {board.name}
            </button>
          ))}
        </div>
        {activeBoard ? (
          <article className="ak-card">
            <small>{activeBoard.code}</small>
            <h3>{activeBoard.name}</h3>
            <p>{activeBoard.description}</p>
            <footer>{activeBoard.threads ? `${activeBoard.threads} 条帖子` : '暂无帖子'}</footer>
          </article>
        ) : (
          boards.length ? (
            <div className="ak-grid three">
              {boards.map((board) => (
                <button className="preview-link" key={board.name} onClick={() => go(`forum/${board.code.toLowerCase()}`)}>
                  <small>{board.code}</small><strong>{board.name}</strong><p>{board.description}</p><footer>{board.threads ? `${board.threads} 条帖子` : '暂无帖子'}</footer><ChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : <Empty />
        )}
      </section>
      <GiscusPanel config={data.giscus} board={activeBoard} />
    </PageShell>
  );
}

function GiscusPanel({ config, board }) {
  const ref = useRef(null);
  useEffect(() => {
    const target = ref.current; if (!target || !config?.repo || !config?.repoId) return;
    target.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js'; script.async = true; script.crossOrigin = 'anonymous';
    // main page: show ALL discussions in category; sub-page: specific to board name
    const attrs = {
      repo: config.repo, 'repo-id': config.repoId,
      category: config.category, 'category-id': config.categoryId,
      mapping: board ? 'specific' : 'category',
      term: board ? board.name : undefined,
      'reactions-enabled': config.reactionsEnabled || '1',
      'emit-metadata': '1',
      'input-position': config.inputPosition || 'top',
      theme: config.theme || 'preferred_color_scheme', lang: 'zh-CN'
    };
    Object.entries(attrs).forEach(([k, v]) => { if (v) script.setAttribute(`data-${k}`, v); });
    target.appendChild(script);
  }, [config, board]);

  const discussionsUrl = config?.repo ? `https://github.com/${config.repo}/discussions` : '#';

  return (
    <section className="content-section animated-section">
      <span className="kicker"><GradientText>发帖区 POSTS</GradientText></span>
      <h2 className="section-title">{board ? `${board.name} 发帖区` : '全部帖子'}</h2>
      <p className="post-hint">支持拖拽或粘贴图片到输入框上传。帖子管理请前往 <a href={discussionsUrl} target="_blank" rel="noreferrer">GitHub Discussions <ExternalLink size={12} /></a></p>
      <div className="giscus-panel ak-card" ref={ref}>{!config?.repo && <p>讨论系统尚未配置。</p>}</div>
    </section>
  );
}

/* ============================================================
   MEDIA PAGE
   ============================================================ */
function MediaPage({ data }) {
  return (
    <PageShell eyebrow="视频 MEDIA" title="视频中心">
      <section className="content-section animated-section">
        {data.media.length ? (<div className="video-grid">{data.media.map((v) => (<article className="ak-card" key={v.title}><small>{v.category}</small><h3>{v.title}</h3><p>{v.description}</p>{v.embedUrl ? <iframe title={v.title} src={v.embedUrl} loading="lazy" allowFullScreen /> : <Empty compact />}{v.externalUrl ? <a className="ghost-action small" href={v.externalUrl} target="_blank" rel="noreferrer">前往 Bilibili <ExternalLink size={14} /></a> : null}</article>))}</div>) : <Empty />}
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
   ADMIN PAGE
   ============================================================ */
function AdminPage({ data, user, onLogin }) {
  return (
    <PageShell eyebrow="后台 ADMIN" title="管理后台">
      {!user?.isAdmin ? (
        <section className="content-section animated-section">
          <article className="admin-card" style={{ textAlign: 'center' }}><Lock size={26} style={{ marginBottom: 16 }} /><h3>需要管理员权限</h3><p>仅社团管理员 (xiao-he-he) 可访问后台。请使用 GitHub 登录。</p>{!user && <button className="primary-action small" onClick={onLogin}>GitHub 登录</button>}</article>
        </section>
      ) : (
        <>
          <section className="content-section animated-section">
            <span className="kicker"><GradientText>成员与权限 ROLES</GradientText></span><h2 className="section-title">角色权限</h2>
            <div className="ak-grid three">{data.members.map((role) => (<article className="admin-card" key={role.role}><small>{role.level}</small><h3>{role.role}</h3><p>{role.description}</p><footer>{role.permissions.join('、')}</footer></article>))}</div>
          </section>
          {data.integrations.links.length > 0 && (
            <section className="content-section animated-section">
              <span className="kicker"><GradientText>集成 INTEGRATIONS</GradientText></span><h2 className="section-title">飞书链接</h2>
              <div className="ak-grid three">{data.integrations.links.map((link) => (<a className="ak-card" href={link.url} target="_blank" rel="noreferrer" key={link.label}><small>{link.type}</small><h3>{link.label}</h3></a>))}</div>
            </section>
          )}
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
  const { user, authStatus, login, logout } = useGitHubAuth();
  const activeRoute = routeMap[route] ? route : 'home';
  useGsapPage(activeRoute, loading);

  const page = useMemo(() => {
    if (authStatus === 'processing') return <div className="loading">登录中，请稍候…</div>;
    if (authStatus === 'error') return <div className="loading">登录失败，请重试。<br/><button className="ghost-action small" onClick={() => { window.location.href = window.location.origin + BASE; }} style={{marginTop:16}}>返回首页</button></div>;
    if (loading) return <div className="loading">载入中</div>;
    const props = { data };
    switch (activeRoute) {
      case 'archive': return <ArchivePage {...props} />;
      case 'knowledge': return <KnowledgePage {...props} />;
      case 'events': return <EventsPage {...props} />;
      case 'forum': return <ForumPage {...props} sub={sub} />;
      case 'media': return <MediaPage {...props} />;
      case 'music': return <MusicPage {...props} />;
      case 'resources': return <ResourcesPage {...props} />;
      case 'admin': return <AdminPage {...props} user={user} onLogin={login} />;
      default: return <HomePage {...props} />;
    }
  }, [activeRoute, sub, data, loading, user]);

  return (
    <ClickSpark sparkColor="#EF4444" sparkSize={20} sparkRadius={30} sparkCount={10} duration={400}>
      <PixelSnow color="#e8eef4" flakeSize={0.008} pixelResolution={800} speed={0.7} density={0.22} variant="snowflake" direction={130} brightness={0.65} />
      <TopNav route={activeRoute} user={user} onLogin={login} onLogout={logout} />
      {page}
      <MusicPlayer tracks={data.music} />
    </ClickSpark>
  );
}

createRoot(document.getElementById('root')).render(<App />);
