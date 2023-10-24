//import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.121.1/build/three.module.js';

import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/loaders/DRACOLoader.js';
import { DragControls } from 'https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/controls/DragControls.js';
    import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/controls/OrbitControls.js';
   //const loader = new THREE.TextureLoader();
    var renderer, scene, camera, controls;
    var groundTex,batteryTex,magnetTex;
    var ground,battery, magnet,wire,field,force1,force2,current1,current2;
    var bgColor=new THREE.Color("rgb(0,64,84)");
    var pane;

    var run;
    var resourcePaths=['checker.png','battery.png'];
    var resources=[];
    var loadedResources=0;
    var coil=null;

    var src0=new THREE.Vector3(0,0,0),src1=new THREE.Vector3(0,0,1.5);

    for(let i=0;i<2;i++){
        resources[i]= document.createElement('img');
        resources[i].src = 'resources/'+resourcePaths[i];
        resources[i].onload=load;
    }

    function load(obj){
        loadedResources++;
        if(loadedResources==resourcePaths.length){
            init();
            const loadingScreen = document.getElementById( 'loading-screen' );
            loadingScreen.classList.add( 'fade-out' );
            // optional: remove loader from DOM via event listener
            loadingScreen.addEventListener( 'transitionend', loadingCompleted );
        }
    }

    function loadingCompleted( event ) {
        event.target.remove();
    }

    function loadTexture(index,repeat,n){
        let texture=new THREE.Texture( resources[index] );
        if(repeat){
            texture.wrapS= THREE.RepeatWrapping;
            texture.wrapT= THREE.RepeatWrapping;
            texture.repeat.set( n,n );
        }
        texture.needsUpdate = true;
        return texture;
    }

    var settings={
        intensity:0.4,
        isRunning:true,
        showField:true,
        showForces:true,
        showCurrent:false
    }

    var Fields = [];

    function BodyPhysics(mesh){
        this.mesh=mesh;
        this.velocity=new THREE.Vector3();
        this.angularVelocity=new THREE.Vector3();
        this.acceleration=new THREE.Vector3();
        this.angularAcceleration=new THREE.Vector3();
        this.update=function(dt){
            this.velocity.addScaledVector(this.acceleration,dt);
            this.angularVelocity.addScaledVector(this.angularAcceleration,dt);
            this.mesh.position.addScaledVector(this.velocity,dt);
            let v=this.mesh.rotation;
            v=new THREE.Vector3(v.x,v.y,v.z);
            v.addScaledVector(this.angularVelocity,dt);
            this.mesh.rotation.set(v.x,v.y,v.z);
        }
    }

    

    function createArrow(start,dir,length, thickness,color){
        let cylinderGeom=new THREE.CylinderGeometry( thickness/2, thickness/2, length-thickness*2, 12 );
        let headGeom =new THREE.ConeGeometry( thickness*1.5, thickness*4, 12 );
        let material=new THREE.MeshPhongMaterial( {
            color: color,
        } );
        let cylinder=new THREE.Mesh( cylinderGeom, material );
        cylinder.position.set(0,length/2-thickness,0);
        let head=new THREE.Mesh( headGeom, material );

        head.position.set(0,length-thickness*2,0);
        let arrow=new THREE.Group();
        arrow.add(cylinder);
        arrow.add(head);
        var axis = new THREE.Vector3(0, 1, 0);
        arrow.quaternion.setFromUnitVectors(axis, dir.clone().normalize());
        arrow.position.set(start.x,start.y,start.z);
        return arrow;
    }

     /**
    * returns field vector at point p
    */
   var fieldEvaluator=function(p){
    let factor=0.7;
    let AP=p.clone().sub(src0);
    let BP=p.clone().sub(src1);

    let d1=AP.length();
    let d2=BP.length();

    AP=AP.multiplyScalar (factor/(d1*d1));
    BP=BP.multiplyScalar (factor/(d2*d2));

    // BP=BP.sub(AP);
    // console.log(p);
    //console.log(AP);
    return BP;
}

 /**
  * @param field
  * @param options {minBounds, maxBounds,arrowLoc (0 to 1), arrowSize, stopPoints (array),fieldColor, arrowColor}
  * @constructor
  */
 function VectorField(options){
     this.minBounds=new THREE.Vector3(-2,-3,-2);
     this.maxBounds=new THREE.Vector3(2,3,2);
     this.arrowLoc=0.35;
     this.arrowSize=0.03;
     this.maxSteps=50;
     this.stopPoints=[];
     this.fieldColor="#ffffff";
     this.arrowColor="#ffffff";
     this.min=1E-12;
     this.max=1E12;
     this.step=0.5;
     this.useTube=false;

     if(options){
         if(options.minBounds)this.minBounds=options.minBounds;
         if(options.maxBounds)this.maxBounds=options.maxBounds;
         if(options.arrowLoc)this.arrowLoc=options.arrowLoc;
         if(options.arrowSize)this.arrowSize=options.arrowSize;
         if(options.maxSteps)this.maxSteps=options.maxSteps;
         if(options.fieldColor)this.fieldColor=options.fieldColor;
         if(options.arrowColor)this.arrowColor=options.arrowColor;
         if(options.stopPoints)this.stopPoints=options.stopPoints;
         if(options.fieldEvaluator)this.fieldEvaluator=options.fieldEvaluator;
         if(options.min)this.min=options.min;
         if(options.max)this.max=options.max;
         if(options.step)this.step=options.step;
     }

     this.addStopPoints=function(p){
         this.stopPoints[ this.stopPoints.length]=p;
     }

     this.getFieldAt=function(p){
         return fieldEvaluator(p);
     }

     this.createField=function(pt, moveAgainstField,opacity) {
         let vertices = [];
         let dir = fieldEvaluator(pt).normalize();
         let prevDir = new THREE.Vector3();
         prevDir.set(dir.x, dir.y, dir.z);
         if (!dir) return;
         vertices[vertices.length] = pt;
         let p = pt.clone();
         let k = moveAgainstField ? -1 : 1;
         let n = 0;
         outer:
             while (n < this.maxSteps) {
                 if (!dir) break;
                 let E = dir.normalize();
                 //avoid abrupt change in field
                 if (dir.dot(prevDir) < -0.5) break;
                 prevDir.set(dir.x, dir.y, dir.z);
                 if (E < this.min || E > this.max) break;
                 dir = dir.multiplyScalar(k * this.step);
                 p.add(dir);
                 if (!withinBounds(p, this.minBounds, this.maxBounds)) break;

                 if (p.distanceTo(pt) < this.step / 2) {
                     vertices[vertices.length] = new THREE.Vector3(pt.x, pt.y, pt.z);
                     break;
                 }
                 for (let i = 0; i < this.stopPoints.length; i++) {
                     let stopPoint = this.stopPoints[i];
                     if (p.distanceTo(stopPoint) < step / 2) {
                         vertices[vertices.length] = new THREE.Vector3(stopPoint.x, stopPoint.y, stopPoint.z);
                         break outer;
                     }
                 }

                 vertices[vertices.length] = new THREE.Vector3(p.x, p.y, p.z);
                 dir = fieldEvaluator(p);
                 n++;
             }
         //console.log(vertices);
         if (vertices.length < 2) return;
         let curve = new THREE.CatmullRomCurve3(vertices);
         let geometry;
         let material;
         let curveObject;
         if (this.useTube) {
             geometry = new THREE.TubeGeometry(curve, 40, this.arrowSize/5, 5);
             material=new THREE.MeshPhongMaterial( {
                 color: this.fieldColor,
             } );
             curveObject = new THREE.Mesh(geometry, material);
         } else {
             let points = curve.getPoints(50);
             geometry = new THREE.BufferGeometry().setFromPoints(points);
             material = new THREE.LineBasicMaterial({color: this.fieldColor, linewidth: 4});
             curveObject = new THREE.Line(geometry, material);
             //material = new MeshLineMaterial({
               //  lineWidth:2.5,
                // color:this.fieldColor
             //});
             //const line = new MeshLine();
            // line.setPoints(points);
            // curveObject = new THREE.Line(geometry, material);
         }

         let ap1=curve.getPoint(this.arrowLoc);
         //let ap2=curve.getPoint(this.arrowLoc+this.arrowSize);
         dir=fieldEvaluator(ap1).normalize();
         const arrowHelper = new THREE.ArrowHelper(dir, ap1, this.arrowSize, this.arrowColor,1.5*this.arrowSize,this.arrowSize);
         curveObject.add(arrowHelper);

         if(opacity)material.opacity=opacity;
         return curveObject;
     }

     function withinBounds(p,minBounds,maxBounds){
         if(p.x<minBounds.x||p.y<minBounds.y||p.z<minBounds.z ||
             p.x>maxBounds.x ||p.y>maxBounds.y||p.z>maxBounds.z)return false;
         return true;
     }
 }

    



    function init() {
        pane = new Tweakpane.Pane({container:document.getElementById("gui"),title:"Rolling on Plane",expanded: true});
        // pane.addInput(settings, "intensity",{label:"Field Intensity",min:-1,max:1,step:0.01}).on('change',updateField);
        pane.addInput(settings, "showField",{label:"Show Fields"}).on('change',updateParams);
        // pane.addInput(settings, "showForces",{label:"Show Forces"}).on('change',updateParams);
        // pane.addInput(settings, "showCurrent",{label:"Show Current"}).on('change',updateParams);
        pane.addInput(settings, "isRunning",{label:"Run"}).on('change',updateParams);
       // pane.addButton({title:"Reset"}).on('click',reset);

        document.querySelector(".trigger_popup_fricc").onclick=function(){
            document.querySelector('.hover_bkgr_fricc').style.display = "block";
        };
        document.querySelector('.hover_bkgr_fricc').onclick =function(){
            document.querySelector('.hover_bkgr_fricc').style.display = "none";
        };
        document.querySelector('.popupCloseButton').onclick=function(){
            document.querySelector('.hover_bkgr_fricc').style.display = "none";
        };
        window.addEventListener( 'resize', onWindowResize, false );

        groundTex=loadTexture(0,true,3,3);
        batteryTex=loadTexture(1);

        // renderer
        renderer = new THREE.WebGLRenderer({antialias :true});
        renderer.setSize( window.innerWidth, window.innerHeight );
        renderer.setPixelRatio( window.devicePixelRatio );
        renderer.shadowMap.enabled = true;
        renderer.shadowMapSoft = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.physicallyBasedShading = true;
        document.body.appendChild( renderer.domElement );

        // scene
        scene = new THREE.Scene();
        scene.background=bgColor;

        // camera
        camera = new THREE.PerspectiveCamera( 30, window.innerWidth / window.innerHeight, 1, 30 );
        camera.position.set( 0, 3, 5 );

        // controls
        controls = new OrbitControls( camera, renderer.domElement );

        // ambient
        scene.add( new THREE.AmbientLight( 0x222222 ) );

        // light
        var light = new THREE.DirectionalLight( 0xaaaaaa, 1);
        light.position.set(1,3,2 ); //20,20,0
        light.castShadow=true;

        light.shadow.camera.left = -2;
        light.shadow.camera.top = 2;
        light.shadow.camera.right = 2;
        light.shadow.camera.bottom = -2;
        light.shadow.camera.near = 1;
        light.shadow.camera.far = 5;
        light.shadow.bias=-0.005;

        	//light.shadowBias = 2;
        	//light.shadowMapWidth = light.shadowMapHeight = 2040;
        light.shadow.darkness = 1;
        //light.shadowCameraVisible = true;
        //scene.add( new THREE.DirectionalLight(light, 2.5) );
        scene.add( light );

        // axes
        //scene.add( new THREE.AxesHelper( 20 ) );

        light = new THREE.PointLight( 0xffffff,0.45 ); // soft white light
        light.position.set(0,0,0);
        light.castShadow = true;
        camera.add( light );
        scene.add(camera);


        //OBJ LOAD

  // load model

  const manager = new THREE.LoadingManager();
  const materials_red = new THREE.MeshPhongMaterial({color:'red'})
  const materials_blue = new THREE.MeshPhongMaterial({color:'blue'})
  const material_golden = new THREE.MeshPhongMaterial({color:'gold'})
  const material_Battery = new THREE.MeshPhongMaterial({map:batteryTex})


  var vField=new VectorField();
  






  var toAnimate;
  var motor;
  
//   LOADING MOTOR
  new THREE.MTLLoader(manager).load(
    "",
    function (materials) {
      materials.preload();

      new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/dc_motor_rotor.obj", function (object) {
            
            object.position.y = 0;
            object.position.z = 0;
            object.position.x = 0
            object.castShadow = true;
            console.log(object)
          
            object.rotation.x = 0
            object.scale.set(0.01, 0.01, 0.01);
          
            object.traverse( function ( child ) {

            if ( child.isMesh ) child.material = material_golden;
        
        } );
        motor = object;
        console.log("motor loaded")
        console.log(motor)
        console.log("motor loaded")
        scene.add(object);
        // add(motor)
        
        
        });
    }
  );
    var dir=1;
//   new THREE.ArrowHelper(dir, ap1, this.arrowSize, this.arrowColor,1.5*this.arrowSize,this.arrowSize);
  //const arrowHelper = new THREE.ArrowHelper( new THREE.Vector3(dir*0.9,dir*0.45,0), new THREE.Vector3(0.3,0.45,0), 0.01, 0x00dd00,0.01,0.04 );

  
//   async function objloadder(motor) {
//     console.log('calling');
//     const result = await scene.add(obj);
    
//   }
  
//   asyncCall();


//   LOADING battery_line
new THREE.MTLLoader(manager).load(
    "",
    function (materials) {
      materials.preload();

    new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/dc_motor_battery.obj", function (object) {
            object.position.y = 0;
            object.position.x = 0
            console.log(object)
            object.rotation.x = 0
            object.scale.set(0.01,0.01,0.01);
            
          object.traverse( function ( child ) {

            if ( child.isMesh ) child.material = materials_red;
        
        } );
          scene.add(object);
        });
    }
  );

// LOADING Battery

new THREE.MTLLoader(manager).load(
    "",
    function (materials) {
      materials.preload();

    new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/Battery_AA.obj", function (object) {
            object.position.y = -1.3;
            object.position.z = 0.6;
            object.position.x = 0

            object.rotation.y = .45
            object.rotation.x = -2.5
            object.rotation.z = 1.42

            console.log(object)
            object.rotation.x = 0
            object.scale.set(0.001,0.001,0.001);
          object.traverse( function ( child ) {

            if ( child.isMesh ) child.material = material_Battery;
        
        } );
          scene.add(object);
        });
    }
  );

//   LOADING COIL
new THREE.MTLLoader(manager).load(
    "",
    function (materials) {
      materials.preload();

    new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/dc_motor_coil.obj", function (object) {
          object.position.y = 0;
          object.position.z = 0;
object.position.x = 0
          console.log(object)
          object.rotation.x = 0
          object.scale.set(0.01,0.01,0.01);
          object.traverse( function ( child ) {

            if ( child.isMesh ) child.material = materials_red;
        
        } );
            coil=object;
          scene.add(object);
        });
    }
  );

  //   LOADING Bridge
new THREE.MTLLoader(manager).load(
    "",
    function (materials) {
      materials.preload();

    new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/dc_motor_bridge.obj", function (object) {
          object.position.y = 0;
          object.position.z = 0;
object.position.x = 0
          console.log(object)
          object.rotation.x = 0
          object.scale.set(0.01,0.01,0.01);
          object.castShadow = true;
          object.traverse( function ( child ) {

            if ( child.isMesh ) child.material = materials_red;
        
        } );
        object.castShadow = true;
          scene.add(object);
        });
    }
  );


  //   LOADING Magnet n
new THREE.MTLLoader(manager).load(
    "",
    function (materials) {
      materials.preload();

    new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/dc_motor_magnet_n.obj", function (object) {
          object.position.y = 0;
          object.position.z = 0;
object.position.x = 0
          console.log(object)
          object.rotation.x = 0
          object.scale.set(0.01,0.01,0.01);
          object.castShadow = true;
          object.traverse( function ( child ) {

            if ( child.isMesh ) child.material = materials_blue;
        
        } );
          scene.add(object);
        });
    }
  );

  //   LOADING Magnet s
  new THREE.MTLLoader(manager).load(
    "",
    function (materials) {
      materials.preload();

       new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/dc_motor_magnet_s.obj", function (object) {
          object.position.y = 0;
          object.position.z = 0;
object.position.x = 0
          console.log(object)
          object.rotation.x = 0
          object.scale.set(0.01,0.01,0.01);
          object.traverse( function ( child ) {

            if ( child.isMesh ) child.material = materials_red;
        
        } );
          scene.add(object);
        // load(object);
        });
    }
  );
    

    
    // var result;
// async function load(result){
//     // result = await mag_load();
//     console.log("result is" + result)
//     // scene.add(result);
// }

// load()
// scene.add(result);

//   battery=Threed.createModel(Threed.Meshes.createCylinder(0.105, 0.97, 10, true),null);
// let cap=Threed.createModel(Threed.Meshes.createCylinder(0.02, 0.03, 10, true),null);
// cap.setMaterial(Threed.createMaterial("silver"));


// var points = [];
// points.push(new THREE.Vector3(-0.17,0,-1));
// points.push(new THREE.Vector3(-0.1,0,-1));
// points.push(new THREE.Vector3(-0.1,0,-0.5));
// points.push(new THREE.Vector3(-0.4,0,-0.5));
// points.push(new THREE.Vector3(-0.4,0,0.5));
// points.push(new THREE.Vector3(0.4,0,0.5));
// points.push(new THREE.Vector3(0.4,0,-0.5));
// points.push(new THREE.Vector3(0.1,0,-0.5));
// points.push(new THREE.Vector3(0.1,0,-1.0));
// points.push(new THREE.Vector3(0.17,0,-1.0));

var wire1=[new THREE.Vector3(-.055,0.15,0),new THREE.Vector3(-.055,0.7,0)];
var wire2=[new THREE.Vector3(0.38,0.7,0),new THREE.Vector3(0.38,0.15,0)];
var wire3=[new THREE.Vector3(-.055,0.7,0),new THREE.Vector3(0.38,0.7,0)];

const wires =[wire1,wire2,wire3];

// var LineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 8 });
// const geometry = new THREE.BufferGeometry().setFromPoints( pts );
// const wire = new THREE.Line( geometry, LineMat );
// wire.rotation.x = Math.PI;

// wire.position.z = 0.45;
// wire.position.y = 0.230
// wire.position.x =- 0.325;
// wire.scale.set(2,0.9,1);
// console.log("wire")
// console.log(wire.geometry)
// wire.castShadow = true;
// scene.add( wire );

for(let i=0;i<3;i++)
{const curve = new THREE.CatmullRomCurve3(wires[i]);
//const points = curve.getPoints( 50 );
let geo = new THREE.TubeGeometry( curve, 20, 0.003, 8, false );
let mat = new THREE.MeshBasicMaterial( { color: 'red' } );
let  mesh = new THREE.Mesh( geo, mat );
mesh.rotation.x = Math.PI;

mesh.position.z = 0.45;
mesh.position.y = 0.230
mesh.position.x =- 0.325;
mesh.scale.set(2,0.9,1);
scene.add( mesh );}

// wire.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI);
// wire.rotation.x = Math.PI/2;
// wire.rotation.y = Math.PI/2;
// wire.rotation.z = Math.PI/2;

// FIELD
const pts1=[new THREE.Vector3(-0.7,0.20,-0.40),new THREE.Vector3(0.0,0.15,-0.40),new THREE.Vector3(0.7,0.20,-0.40)];
var pts2 =[]
var pts3 =[]
var pts4 =[]

for(let i=0;i<3;i++){
    pts1[i].y = pts1[i].y - 0.05
}


for(let i=0;i<3;i++) {
    pts2.push(new THREE.Vector3(pts1[i].x,pts1[i].y,pts1[i].z+0.15))
}
for(let i=0;i<3;i++) {
    pts3.push(new THREE.Vector3(pts1[i].x,pts1[i].y,pts1[i].z+0.3))
}
for(let i=0;i<3;i++) {
    pts4.push(new THREE.Vector3(pts1[i].x,pts1[i].y,pts1[i].z+0.45))
}

var pts5 =[]
var pts6 =[]
var pts7 =[]
var pts8 =[]

for(let i=0;i<3;i++)
{
    pts5.push(new THREE.Vector3(pts1[i].x,pts1[i].y-0.10,pts1[i].z))
    pts6.push(new THREE.Vector3(pts2[i].x,pts2[i].y-0.10,pts2[i].z))
    pts7.push(new THREE.Vector3(pts3[i].x,pts3[i].y-0.10,pts3[i].z))
    pts8.push(new THREE.Vector3(pts4[i].x,pts4[i].y-0.10,pts4[i].z))
}
pts5[0].y -= 0.05
pts5[2].y -= 0.05
pts6[0].y -= 0.05
pts6[2].y -= 0.05
pts7[0].y -= 0.05
pts7[2].y -= 0.05
pts8[0].y -= 0.05
pts8[2].y -= 0.05

var pts9 =[]
var pts10 =[]
var pts11 =[]
var pts12 =[]

for(let i=0;i<3;i++)
{
    pts9.push(new THREE.Vector3(pts5[i].x,pts5[i].y-0.10,pts5[i].z))
    pts10.push(new THREE.Vector3(pts6[i].x,pts6[i].y-0.10,pts6[i].z))
    pts11.push(new THREE.Vector3(pts7[i].x,pts7[i].y-0.10,pts7[i].z))
    pts12.push(new THREE.Vector3(pts8[i].x,pts8[i].y-0.10,pts8[i].z))
}
pts9[0].y -= 0.05
pts9[2].y -= 0.05
pts10[0].y -= 0.05
pts10[2].y -= 0.05
pts11[0].y -= 0.05
pts11[2].y -= 0.05
pts12[0].y -= 0.05
pts12[2].y -= 0.05





var points = [pts1, pts2, pts3, pts4, pts5, pts6, pts7, pts8, pts9, pts10, pts11, pts12];



 
 
const material = new THREE.LineBasicMaterial( { color: 'white' } );

// Create the final object to add to the scene
// scene.add( new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1) , material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts2), material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts3), material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts4), material ) );



// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts5), material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts6), material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts7), material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts8), material ) );

// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts9), material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts10), material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts11), material ) );
// scene.add( new THREE.Line( new THREE.BufferGeometry().setFromPoints(pts12), material ) );

// Create a sine-like wave

const field_color= '#fefae0';
for(let i = 0; i <12;i++){
    const curve = new THREE.CatmullRomCurve3( points[i]);
    //const points = curve.getPoints( 50 );
    let geo = new THREE.TubeGeometry( curve, 20, 0.003, 8, false );
    let mat = new THREE.MeshBasicMaterial( { color: field_color } );
    let  mesh = new THREE.Mesh( geo, mat );
    scene.add( mesh );
    let arrowHelper = new THREE.ArrowHelper(curve.getTangent(0.3), curve.getPoint(0.3),0.1, field_color,0.07,0.04);
    mesh.add(arrowHelper);
    arrowHelper = new THREE.ArrowHelper(curve.getTangent(0.6), curve.getPoint(0.6),0.1, field_color,0.07,0.04);
    mesh.add(arrowHelper);
    Fields.push(mesh);
    
    
}


// var angle = new THREE.Vector3(0,0,0);
// angle.x = pts1[2].x - pts1[1].x;
// angle.y = pts1[2].y - pts1[1].y;
// angle.z = pts1[2].z - pts1[1].z;

// //var angle = (pts1[2].y- pts1[1].y)/(pts1[2].x- pts1[1].x);
// console.log(angle);
// arrowHelper = new THREE.ArrowHelper(angle,pts1[1],0.1, "red",0.08,0.05);
// scene.add(arrowHelper);


// //  scene.add(createArrow( pts1[1],angle, 0.01,'white'))
//  arrowHelper(pts1[1], angle)
// arrowHelper(pts1[1])


// let f2 = vField.createField(new THREE.Vector3(-0.7,0.20,-0.40), true);
//   scene.add(f2)


// for(let i=0; i < 2*Math.PI;i=i+0.11){
//     let x = src1.x + 0.1 * Math.cos(i);
//     let y = src1.y + 0.1 * Math.sin(i);
//     let f = vField.createField(new THREE.Vector3(x,y,src1.z), false);
//     scene.add(f)

//     y = src1.y + 0.1 * Math.cos(i);
//     let z = src1.z + 0.1 * Math.sin(i);
//     x = src1.x
//     f = vField.createField(new THREE.Vector3(x,y,z), false);
//     scene.add(f)
// }
        //Ground
        const groundGeo = new THREE.PlaneGeometry(3, 3);
        const groundMat = new THREE.MeshPhongMaterial({
            map: groundTex,
            shininess:0,
            color:0xAAAABB,
            specular:0x000000
            //side: THREE.DoubleSide,
        });
        groundMat.color.setRGB(1.5, 1.5, 1.5);
        ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x=-Math.PI/2;
        ground.position.y = -0.7;
        ground.receiveShadow=true;
        scene.add(ground);

        

        //field
        // field = new THREE.Group();
        // magnet.add(field);
        // field.castShadow=true;
        // updateField();
        setTimeout(()=>{animate();},1000);
        
    }



    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( window.innerWidth, window.innerHeight );

    }

    function animate(x) {
        requestAnimationFrame( animate );
        
        renderer.render(scene, camera);
        if(settings.isRunning) {
            coil.rotation.z+=0.05;
        }

    }


    function updateParams(){
    
    for(let i=0;i<12;i++){
    Fields[i].visible = settings.showField;
    }
    
    //    force1.visible=settings.showForces;
    //    force2.visible=settings.showForces;
    //     current1.visible=settings.showCurrent;
    //     current2.visible=settings.showCurrent;

       run = settings.isRunning;

    }

    function updateField(){
        let B=settings.intensity;
        wire.physics.angularVelocity.set(0,2*B,0);
        //create field
        field.clear();
        wire.clear();
        if(B==0)return;
        let dir=B>0?1:-1;
        B=Math.abs(B);
        let N=4+30*(B);
        let pts=[new THREE.Vector3(0,0,0),new THREE.Vector3(0.0,0.1,0),new THREE.Vector3(0.01,0.2,0),new THREE.Vector3(0.3,0.45,0),new THREE.Vector3(1,0.6,0)];

        let curve = new THREE.CatmullRomCurve3(pts);
        let points = curve.getPoints( 50 );
        let geometry = new THREE.BufferGeometry().setFromPoints( points );
        let material = new THREE.LineBasicMaterial( { color : 0x00dd00 ,linewidth: 2} );
        let curveObject = new THREE.Line( geometry, material );
        const arrowHelper = new THREE.ArrowHelper( new THREE.Vector3(dir*0.9,dir*0.45,0), new THREE.Vector3(0.3,0.45,0), 0.01, 0x00dd00,0.01,0.04 );
        curveObject.add(arrowHelper);
        for(let i=0;i<N;i++){
            field.add(curveObject);
            curveObject = curveObject.clone();
            curveObject.rotation.set(0,2*i*Math.PI/N,0);
        }

        force1=new THREE.ArrowHelper( new THREE.Vector3(0,0,-dir), new THREE.Vector3(0.7,0,0), B, 0xff0000,0.01,0.04 );
        force2=new THREE.ArrowHelper( new THREE.Vector3(0,0,dir), new THREE.Vector3(-0.7,0,0), B, 0xff0000,0.01,0.04 );

        current1=new THREE.ArrowHelper( new THREE.Vector3(0,-1,0), new THREE.Vector3(0.67,0,0), 0.15, 0xffffff,0.01,0.04 );
        current2=new THREE.ArrowHelper( new THREE.Vector3(0,-1,0), new THREE.Vector3(-0.67,0,0), 0.15, 0xffffff,0.01,0.04 );

        wire.add(force1);
        wire.add(force2);
        wire.add(current1);
        wire.add(current2);

    }

    function updatePhysics(dt){
        wire.physics.update(dt);
    }

