import {useEffect,useRef,useState} from "react";
import {apiFetch} from "./api";
import type {CouplePose,AvatarStyle} from "./couple-avatar-model";
import "./avaturn-3d.css";
type Props={token:string;mine:boolean;partner:boolean;pose:CouplePose;
 mineStyle:AvatarStyle;partnerStyle:AvatarStyle;onUnavailable:()=>void};
type Imported=typeof import("three");
type BonePose={bone:import("three").Bone;rest:import("three").Quaternion};
type Figure={root:import("three").Group;bone:Record<string,BonePose|undefined>;mirror:number};
function normalize(value:string){return value.toLowerCase().replace(/[^a-z0-9]/g,"")}
function identify(value:string){
 const name=normalize(value);
 if(/(head|jhead)$/.test(name)&&!name.includes("headtop"))return "head";
 if(/(leftupperarm|leftarm|lupperarm|larm)$/.test(name)&&!name.includes("forearm"))return "leftArm";
 if(/(rightupperarm|rightarm|rupperarm|rarm)$/.test(name)&&!name.includes("forearm"))return "rightArm";
 if(/(leftforearm|leftlowerarm|lforearm)$/.test(name))return "leftForearm";
 if(/(rightforearm|rightlowerarm|rforearm)$/.test(name))return "rightForearm";
 if(/(leftupleg|leftupperleg|leftthigh|lthigh)$/.test(name))return "leftLeg";
 if(/(rightupleg|rightupperleg|rightthigh|rthigh)$/.test(name))return "rightLeg";
 return "";
}
function animateFigure(T:Imported,figure:Figure,pose:CouplePose,t:number){
 const wave=Math.sin(t*2.15),bounce=Math.sin(t*2.9);
 const closeness=pose==="calin"?0.30+0.18*Math.sin(t*1.9):
  pose==="bisou"?0.23+0.14*Math.sin(t*2.4):0;
 figure.root.position.x=figure.mirror*(-0.82+closeness);
 figure.root.position.y=pose==="danse"?0.05*Math.abs(bounce):0.015*Math.sin(t*1.3);
 figure.root.rotation.y=figure.mirror*(pose==="bisou"?.11:pose==="calin"?.06:.02*wave);
 figure.root.rotation.z=figure.mirror*(pose==="danse"?.045*bounce:
  pose==="calin"?.035*Math.sin(t*1.9):.016*Math.sin(t*1.3));
 // The GLB rig is humanoid, but bone names may vary by exporter. Apply
 // small relative rotations to recognized joints only; never overwrite bind pose.
 const z=new T.Vector3(0,0,1),x=new T.Vector3(1,0,0);
 function move(name:string,amount:number,axis:import("three").Vector3=z){
  const entry=figure.bone[name];if(!entry)return;
  entry.bone.quaternion.copy(entry.rest).multiply(new T.Quaternion().setFromAxisAngle(axis,amount));
 }
 const squeeze=pose==="calin"?0.38+0.12*Math.sin(t*1.9):
  pose==="bisou"?0.28+0.07*Math.sin(t*2.4):
  pose==="main"?.20+0.035*wave:0;
 const dance=pose==="danse"?.25*wave:0;
 move("leftArm",figure.mirror===-1?-squeeze-dance:-.12-dance);
 move("rightArm",figure.mirror===1?squeeze+dance:.12+dance);
 move("leftForearm",pose==="calin"?-.25:pose==="danse"?-.15*bounce:-.1);
 move("rightForearm",pose==="calin"?.25:pose==="danse"?.15*bounce:.1);
 move("head",figure.mirror*(pose==="bisou"?.12*Math.abs(wave):
  pose==="calin"?.06*Math.abs(wave):.012*wave));
 move("leftLeg",pose==="danse"?.12*wave:0,x);
 move("rightLeg",pose==="danse"?-.12*wave:0,x);
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
    renderer.toneMapping=T.ACESFilmicToneMapping;
    const scene=new T.Scene();
    const camera=new T.PerspectiveCamera(32,1,.1,100);
    camera.position.set(0,1.5,7.1);
    camera.lookAt(0,1.4,0);
    scene.add(new T.HemisphereLight(0xe9edff,0x28304e,2.25));
    const front=new T.DirectionalLight(0xffffff,2.7);front.position.set(-3,5,5);scene.add(front);
    const rim=new T.DirectionalLight(0xf7a8da,2.0);rim.position.set(3,3,-4);scene.add(rim);
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
       const gltf=await new loaders.GLTFLoader().parseAsync(bytes,"");
       const model=gltf.scene;
       model.updateMatrixWorld(true);
       const box=new T.Box3().setFromObject(model);
       const size=box.getSize(new T.Vector3());
       const height=size.y||1;
       const factor=Math.min(2.8/height,3.2);
       model.scale.multiplyScalar(factor);
       model.position.y=-box.min.y*factor;
       // glTF avatar conventions usually face +Z; keep camera facing them.
       model.traverse(node=>{
        if(!(node instanceof T.Bone))return;
        const part=identify(node.name);
        if(part&&!bone[part])bone[part]={bone:node,rest:node.quaternion.clone()};
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
     for(const figure of figures)animateFigure(T,figure,poseRef.current,t);
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
 </div>;
}
