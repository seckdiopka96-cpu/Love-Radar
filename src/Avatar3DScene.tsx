import {useEffect,useRef,useState} from "react";
import {apiFetch} from "./api";
import {inspectAvatarGlb} from "./avatar-3d-diagnostics";
import {restoreAvatarColorsOnIOS} from "./avatar-3d-image-fallback";
import {requiresTopLevelAvaturnAuth} from "./avaturn-auth";
import type {CouplePose,AvatarStyle} from "./couple-avatar-model";
import "./avaturn-3d.css";
type Props={token:string;mine:boolean;partner:boolean;pose:CouplePose;
 mineStyle:AvatarStyle;partnerStyle:AvatarStyle;onUnavailable:()=>void};
type Imported=typeof import("three");
type BonePose={bone:import("three").Bone;rest:import("three").Quaternion;side:number};
type Figure={root:import("three").Group;bone:Record<string,BonePose|undefined>;mirror:number};
function normalize(value:string){return value.toLowerCase().replace(/[^a-z0-9]/g,"")}
function identify(value:string){
 const n=normalize(value);
 if(/(?:head|jhead)$/.test(n)&&!n.includes("headtop"))return "head";
 for(const [long,short] of [["left","l"],["right","r"]] as const){
  if(n.endsWith(long+"forearm")||n.endsWith(long+"lowerarm")||
    n.endsWith(long+"elbow")||n.endsWith(short+"forearm")||
    n.endsWith("forearm"+short)||n.endsWith("lowerarm"+short))return long+"Forearm";
  if(n.endsWith(long+"upperarm")||n.endsWith(long+"arm")||
    n.endsWith(short+"upperarm")||n.endsWith(short+"arm")||
    n.endsWith("upperarm"+short)||n.endsWith("arm"+short)||
    n.endsWith("arm"+long))return long+"Arm";
  if(n.endsWith(long+"upleg")||n.endsWith(long+"upperleg")||
    n.endsWith(long+"thigh")||n.endsWith(short+"upleg")||
    n.endsWith("thigh"+short)||n.endsWith("upperleg"+short))return long+"Leg";
 }
 return "";
}
function animateFigure(T:Imported,figure:Figure,pose:CouplePose,t:number,duoReady:boolean){
 const wave=Math.sin(t*2.4),bounce=Math.sin(t*3.5);
 const closeness=pose==="calin"?.35+.08*Math.sin(t*1.3):
  pose==="bisou"?.37+.05*Math.sin(t*1.5):pose==="main"?.10:0;
 // Mirror -1 (me) is the LEFT side, +1 (partner) the RIGHT.
 figure.root.position.x=figure.mirror*(.82-closeness);
 figure.root.position.y=pose==="danse"?.09*Math.abs(bounce):
  pose==="calin"?.02*Math.sin(t*1.6):.012*Math.sin(t*1.3);
 figure.root.rotation.y=figure.mirror*(pose==="danse"?.15*wave:
  pose==="bisou"?.13:pose==="calin"?.1:.012*wave);
 figure.root.rotation.z=figure.mirror*(pose==="danse"?.09*bounce:
  pose==="calin"?.055*Math.sin(t*1.3):pose==="bisou"?.12:.012*Math.sin(t*1.3));
 // Rotate in WORLD axes, preserving each model's local bind pose and parent axes.
 function move(name:string,amount:number,axis:import("three").Vector3){
  const entry=figure.bone[name];if(!entry)return;
  const parentQuat=new T.Quaternion();
  entry.bone.parent?.getWorldQuaternion(parentQuat);
  const correction=parentQuat.clone().invert()
   .multiply(new T.Quaternion().setFromAxisAngle(axis,amount))
   .multiply(parentQuat);
  entry.bone.quaternion.copy(correction.multiply(entry.rest));
 }
 const z=new T.Vector3(0,0,1),x=new T.Vector3(1,0,0);
 const nearSide=-figure.mirror;
 for(const armName of ["leftArm","rightArm"] as const){
  const joint=figure.bone[armName];if(!joint)continue;
  const side=joint.side||(armName==="leftArm"?-1:1);
  const near=side===nearSide;
  // Avaturn's bind pose has arms horizontally extended. Rotating with the
  // OPPOSITE world-side sign lowers them instead of raising them above the head.
  const angle=(!duoReady&&pose==="main")?-side*1.32:pose==="danse"?
    -side*(.83+.50*wave*(near?1:-1)):
    pose==="calin"?
    -side*(near?.18+.07*Math.sin(t*1.5):1.03):
    pose==="bisou"?
    -side*(.88+.04*wave):
    -side*(near?.67+.03*wave:1.20+.03*wave);
  move(armName,angle,z);
 }
 move("leftForearm",pose==="danse"?.37*wave:pose==="calin"?.30:0,z);
 move("rightForearm",pose==="danse"?-.37*wave:pose==="calin"?-.30:0,z);
 move("head",figure.mirror*(pose==="bisou"?.20+.07*Math.sin(t*1.8):
  pose==="calin"?.11+.03*Math.sin(t*1.6):.02*wave),z);
 move("leftLeg",pose==="danse"?.22*wave:0,x);
 move("rightLeg",pose==="danse"?-.22*wave:0,x);
}
/** A neutral 3D presence marker, not a fake low-poly humanoid avatar.
 * The partner's real Avaturn GLB replaces this automatically when uploaded. */
function makePlaceholder(T:Imported,style:AvatarStyle){
 const root=new T.Group();
 const tint={rose:"#e77fa2",bleu:"#86b2e9",lilas:"#be9ae6",vert:"#87d6c6",soleil:"#f1c787"}[style.outfit];
 const orb=new T.Mesh(new T.IcosahedronGeometry(.40,3),
  new T.MeshPhysicalMaterial({color:tint,roughness:.16,metalness:.2,clearcoat:1,
   clearcoatRoughness:.09,transparent:true,opacity:.82}));
 orb.position.y=1.53;root.add(orb);
 const ringMat=new T.MeshBasicMaterial({color:"#eecce9",transparent:true,opacity:.52,
  side:T.DoubleSide});
 const ring=new T.Mesh(new T.TorusGeometry(.60,.015,9,64),ringMat);
 ring.position.y=1.53;ring.rotation.y=.32;root.add(ring);
 const ring2=new T.Mesh(new T.TorusGeometry(.55,.012,9,64),ringMat.clone());
 ring2.position.y=1.53;ring2.rotation.x=.42;root.add(ring2);
 const base=new T.Mesh(new T.CircleGeometry(.42,40),
  new T.MeshBasicMaterial({color:tint,transparent:true,opacity:.18}));
 base.rotation.x=-Math.PI/2;base.position.y=.015;root.add(base);
 return root;
}
export default function Avatar3DScene({token,mine,partner,pose,mineStyle,partnerStyle,onUnavailable}:Props){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [warning,setWarning]=useState("");
 const poseRef=useRef(pose);poseRef.current=pose;
 const errorRef=useRef(onUnavailable);errorRef.current=onUnavailable;
 useEffect(()=>{
  if(!canvas.current)return;
  const surface=canvas.current;
  let disposed=false,renderer:import("three").WebGLRenderer|null=null;
  let resizeObserver:ResizeObserver|null=null;
  const controller=new AbortController();
  const created:import("three").Object3D[]=[];
  let frame=0;
  async function initialize(){
   try{
    const [T,loaders]=await Promise.all([import("three"),
     import("three/addons/loaders/GLTFLoader.js")]);
    if(disposed)return;
    renderer=new T.WebGLRenderer({canvas:surface,alpha:true,antialias:true,
     powerPreference:"low-power"});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setClearColor(0x0b1627,0);
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.NeutralToneMapping;
    renderer.toneMappingExposure=1.0;
    const scene=new T.Scene();
    const camera=new T.PerspectiveCamera(32,1,.1,100);
    camera.position.set(0,1.5,7.1);
    camera.lookAt(0,1.4,0);
    scene.add(new T.HemisphereLight(0xe9edff,0x28304e,1.35));
    const front=new T.DirectionalLight(0xffffff,2.0);front.position.set(-3,5,5);scene.add(front);
    const rim=new T.DirectionalLight(0xf7a8da,0.85);rim.position.set(3,3,-4);scene.add(rim);
    const floor=new T.Mesh(new T.CircleGeometry(2.7,40),
     new T.MeshBasicMaterial({color:0x8b6f9a,transparent:true,opacity:.1}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.02;scene.add(floor);
    const fetchFigure=async(which:"mine"|"partner",available:boolean,
      style:AvatarStyle,mirror:number):Promise<Figure>=>{
      const root=new T.Group();
      root.position.x=mirror*-.82;scene.add(root);created.push(root);
      const bone:Record<string,BonePose|undefined>={};
      if(available){
       const response=await apiFetch("/api/couple-avatar-model?owner="+which,{
        headers:{Authorization:"Bearer "+token},cache:"no-store",signal:controller.signal});
       if(!response.ok)throw Error("Le modèle 3D du partenaire est indisponible.");
       const bytes=await response.arrayBuffer();
       if(disposed)throw Error("Cancelled");
       const info=inspectAvatarGlb(bytes);
       if(info&&(info.images===0||info.texturedMaterials===0)){
        if(which==="mine")setWarning("Ton GLB ne contient pas les textures de couleur du visage et des vêtements. Réexporte « Avatar (T-Pose) » complet dans Avaturn Hub, puis réimporte-le.");
       }else if(info?.skins===0&&which==="mine"){
        setWarning("Ce GLB ne contient pas de squelette animable : les bras et jambes ne pourront pas bouger. Télécharge « Avatar (T-Pose) » complet.");
       }
       const gltf=await new loaders.GLTFLoader().parseAsync(bytes,"");
       const model=gltf.scene;
       // On iPhone, Three.js ImageBitmap-backed textures can upload as
       // monochrome despite the GLB containing valid JPEG colors. Rebind the
       // embedded base-color maps through HTMLImageElement with glTF sRGB/UV
       // conventions, keeping the original GLB in private R2 unchanged.
       if(requiresTopLevelAvaturnAuth(navigator.userAgent,navigator.platform,
        navigator.maxTouchPoints)){
        const restored=await restoreAvatarColorsOnIOS(T,model,bytes,()=>disposed);
        if(restored===0&&info&&info.texturedMaterials>0&&which==="mine")
         setWarning("Les couleurs sont dans ton GLB, mais Safari n’a pas pu charger ses textures. Réouvre Love Radar ou réimporte le même fichier.");
       }
       if(disposed)throw Error("Cancelled");
       model.updateMatrixWorld(true);
       const box=new T.Box3().setFromObject(model);
       const size=box.getSize(new T.Vector3());
       const height=size.y||1;
       const factor=Math.min(2.8/height,3.2);
       model.scale.multiplyScalar(factor);
       model.position.y=-box.min.y*factor;
       // glTF avatar conventions usually face +Z; keep camera facing them.
       const origin=model.getWorldPosition(new T.Vector3());
       model.traverse(node=>{
        if(!(node instanceof T.Bone))return;
        const part=identify(node.name);
        if(part&&!bone[part]){
         const world=node.getWorldPosition(new T.Vector3());
         const side=world.x-origin.x;
         bone[part]={bone:node,rest:node.quaternion.clone(),
          side:Math.abs(side)<.015?0:Math.sign(side)};
        }
       });
       root.add(model);
      }else root.add(makePlaceholder(T,style));
      return {root,bone,mirror};
    };
    const figures=await Promise.all([
     fetchFigure("mine",mine,mineStyle,-1),
     fetchFigure("partner",partner,partnerStyle,1)
    ]);
    if(disposed)return;
    const resize=()=>{
     if(!renderer||disposed)return;
     const width=Math.max(1,surface.clientWidth),height=Math.max(1,surface.clientHeight);
     renderer.setSize(width,height,false);
     camera.aspect=width/height;camera.updateProjectionMatrix();
    };
    resize();
    resizeObserver=new ResizeObserver(resize);
    resizeObserver.observe(surface);
    setLoading(false);
    let previous=0;
    const noMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
    function draw(now:number){
     if(disposed||!renderer)return;
     if(now-previous<29){frame=requestAnimationFrame(draw);return}
     previous=now;
     const t=noMotion.matches?0:now/1000;
     for(const figure of figures)animateFigure(T,figure,poseRef.current,t,mine&&partner);
     renderer.render(scene,camera);
     frame=requestAnimationFrame(draw);
    }
    frame=requestAnimationFrame(draw);
   }catch(e){
    if(disposed)return;
    setLoading(false);
    setError(e instanceof Error?e.message:"Rendu 3D impossible.");
    errorRef.current();
   }
  }
  void initialize();
  return()=>{
   disposed=true;controller.abort();cancelAnimationFrame(frame);resizeObserver?.disconnect();
   for(const item of created){
    item.traverse(node=>{
     const mesh=node as import("three").Mesh;
     if(!mesh.isMesh)return;
     mesh.geometry?.dispose();
     const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
     for(const m of materials){
      if(!m)continue;
      const data=m as import("three").MeshStandardMaterial;
      for(const key of ["map","normalMap","roughnessMap","metalnessMap","emissiveMap"] as const)
       data[key]?.dispose?.();
      m.dispose();
     }
    });
   }
   if(renderer){renderer.dispose();renderer.forceContextLoss()}
  };
 },[token,mine,partner]);
 return <div className="lr-avatar-three-stage">
  <canvas ref={canvas} className="lr-avatar-three-canvas" aria-label="Vos deux avatars 3D en mouvement"/>
  {loading?<div className="lr-avatar-three-message" role="status">Préparation de vos avatars 3D…</div>:null}
  {error?<div className="lr-avatar-three-message" role="alert">{error}</div>:null}
  {warning&&!error?<div className="lr-avatar-three-warning" role="status">{warning}</div>:null}
 </div>;
}
