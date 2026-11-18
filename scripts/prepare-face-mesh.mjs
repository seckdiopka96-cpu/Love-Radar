/**
 * Vendor MediaPipe runtime assets on our own Love Radar origin.
 * Models are fetched from npm at build time; no external service receives frames.
 * `npm run build` and `npm run dev` invoke this as a pre-hook.
 */
import {mkdir,copyFile,access} from "node:fs/promises";
import {join} from "node:path";
const source=join(process.cwd(),"node_modules","@mediapipe","face_mesh");
const dest=join(process.cwd(),"public","face-mesh");
const required=[
 "face_mesh.binarypb",
 "face_mesh_solution_packed_assets.data",
 "face_mesh_solution_packed_assets_loader.js",
 "face_mesh_solution_simd_wasm_bin.js",
 "face_mesh_solution_simd_wasm_bin.wasm",
 "face_mesh_solution_wasm_bin.js",
 "face_mesh_solution_wasm_bin.wasm"
];
await mkdir(dest,{recursive:true});
for(const file of required){
 await access(join(source,file));
 await copyFile(join(source,file),join(dest,file));
}
console.log("Love Radar: face tracking assets staged locally ("+required.length+" files).");
