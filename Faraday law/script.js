//import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.121.1/build/three.module.js';

import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/loaders/DRACOLoader.js';
import { DragControls } from 'https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/controls/DragControls.js';
    import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/controls/OrbitControls.js';
    // import { DragControls } from 'https://cdn.jsdelivr.net/npm/drag-controls@1.0.4/dist/drag-controls.min.js';
   //const loader = new THREE.TextureLoader();
    var renderer, scene, camera, controls;
    var groundTex;
    var ground;
    var bgColor=new THREE.Color("rgb(0,64,84)");
    var pane;
    var dragControls,orbitControls;
    var base,magnet;
    var run;
    var resourcePaths=['checker.png'];
    var timestamp = null;
    var lastMouseX = null;
    var lastMouseY = null;
    var speedX;
    var dragging = false;
    var resources=[];
    var loadedResources=0;
    var originalMagnetPos = []

    var mesh;
    var originalRotPos = []


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
        
        Move:0,
        isRunning:true,
        speed:1
        
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
        
        pane = new Tweakpane.Pane({container:document.getElementById("gui"),title:"AC Generator",expanded: true});
        // pane.addInput(settings, "speed",{label:"speed",min:-1,max:1,step:0.1}).on('change',updateParams);
        // pane.addInput(settings, "Move",{label:"Move",min:0,max:22,step:0.1}).on('change',updateParams);
        // pane.addInput(settings, "showForces",{label:"Show Forces"}).on('change',updateParams);
        // pane.addInput(settings, "showCurrent",{label:"Show Current"}).on('change',updateParams);
        // pane.addInput(settings, "isRunning",{label:"Run"}).on('change',updateParams);
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
        camera = new THREE.PerspectiveCamera( 30, window.innerWidth / window.innerHeight, 0.1, 30 );
        camera.position.set( 1.8, 2.3, 2.5 );

        // controls
        controls = new OrbitControls( camera, renderer.domElement );

        // ambient
        scene.add( new THREE.AmbientLight( 0x222222) );

        // light
        var light = new THREE.DirectionalLight( 0xaaaaaa, 3);
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
        light.shadow.darkness = 0;
        //light.shadowCameraVisible = true;
        //scene.add( new THREE.DirectionalLight(light, 2.5) );
        scene.add( light );

        // axes
        //scene.add( new THREE.AxesHelper( 20 ) );

        light = new THREE.PointLight( 0xffffff,1); // soft white light
        light.position.set(0,5,0);
        light.castShadow = true;
        camera.add( light );
        scene.add(camera);


        //OBJ LOAD

  // load model

  const manager = new THREE.LoadingManager();


  var vField=new VectorField();
  






  var toAnimate;
  var motor;
  
//   LOADING base
  new THREE.MTLLoader(manager).load(
    "./resources/base.mtl",
    function (materials) {
      materials.preload();

      new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/base.obj", function (object) {
            
            object.position.y = 0;
            object.position.z = 0;
            // object.position.x = -1.5
            object.castShadow = true;
            console.log(object)
          
            object.rotation.x = 0
            // object.traverse(function (child) {
            //     child.castShadow = true;
            // });
            
          
            
        base = object;
        scene.add(object);
        
        
        
        });
    }
  );

  //   LOADING Magnet
  new THREE.MTLLoader(manager).load(
    "./resources/Magnet.mtl",
    function (materials) {
      materials.preload();

      new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/Magnet.obj", function (object) {
            object.position.x = 0.025;
            originalMagnetPos=object.position.clone();
            
            // object.position.y = 0.038;
            // object.position.z = -0.39;
            // object.position.x = -0.015
            object.castShadow = true;
            // console.log(object.position)
            
          
            // object.rotation.y = Math.PI + 0.03

            // originalRotPos.push(object.rotation.y,object.position.y);
            object.traverse(function (child) {
                child.castShadow = true;
            });
            
          
            
        magnet = object;

        // scene.add(object);
        
        
        
        });
    }
  );

//     pts = [new THREE.Vector3(0,0,0.2),new THREE.Vector3(0,0,0.3)];
//   const curve = new THREE.CatmullRomCurve3( pts);
//     // /const points = curve.getPoints( 50 );
//     var geo = new THREE.TubeGeometry( curve, 20, 0.003, 8, false );
//     let mat = new THREE.MeshBasicMaterial( { color: 'black' } );
//     mesh = new THREE.Mesh( geo, mat );
    var extrudeBend = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.0020, 0.115, 0.13),
        new THREE.Vector3(0.08, 0.18, 0.13)
    ]);
    var path= new THREE.TubeGeometry(extrudeBend, 20, 0.003, 10);
    path.translate(0,0,0);

    const geometry = new THREE.CylinderGeometry( 0, 0.005, 0.1, 32 );
    geometry.translate( 0, 0.1/2, 0 );
    // const material = new THREE.MeshBasicMaterial( {color: 0xffff00} );
    // const cylinder = new THREE.Mesh( geometry, material );
    // scene.add( cylinder );

    mesh = new THREE.Mesh( geometry, new THREE.MeshLambertMaterial( { 
        color: 'red', 
        doubleSided: true,
        // wireframe: true 
    } ) );
    mesh.position.set(0.015,0.1,0.15);
    mesh.rotation.x = -0.3;
    
    scene.add( mesh );
   

    

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
        ground.position.y = -0.05;
        ground.receiveShadow=true;
        scene.add(ground);

        // const controlss = new DragControls( [magnet], camera, renderer.domElement );

        // // add event listener to highlight dragged objects

        // controlss.addEventListener( 'dragstart', function ( event ) {

        //     event.object.material.emissive.set( 0xaaaaaa );

        // } );
        
        setTimeout(() => { 
        scene.add(magnet);
        let draggables=[magnet];
        console.log(draggables);
        dragControls = new DragControls( draggables, camera, renderer.domElement );
        //  dragControls.transformGroup=true;
        dragControls.addEventListener("hoveron", function (e) {
            console.log("hover")
            controls.enabled = false;
        });
        dragControls.addEventListener("dragstart", function (e) {
            // console.log(e.object.position.y)
            // e.object.material.emissive.set( 0xaaaaaa );
            controls.enabled = false;
        });
        dragControls.addEventListener("hoveroff", function (e) {
            controls.enabled = true;
            dragging=false;
        });
        dragControls.addEventListener("dragend", function (e) {
            controls.enabled = true;
            dragging=false;
        });
        dragControls.addEventListener("drag", function (e) {
            dragging = true;
            e.object.position.y = originalMagnetPos.y;
            e.object.position.z = originalMagnetPos.z;
            if(e.object.position.x<0.025){
                e.object.position.x=0.025;
            }
            if(e.object.position.x>0.415){
                e.object.position.x=0.415;
            }
            document.addEventListener("mousemove", function(ev){
                // console.log(`Movement X: ${ev.movementX}, Y: ${ev.movementY}`);
                speedX = ev.movementX;
                
            });
            
        });

         }, 1000);
        

        
        animate();
        
    }



    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( window.innerWidth, window.innerHeight );

    }

    function animate() {
        requestAnimationFrame( animate );
        // mesh.rotation.z+=0.01;
        // createjs.Tween.get(mesh.rotation).to({z:0.35},1000);
        // mesh.rotation.z = 0.35 * Math.cos(magnet.rotation.z);

       if(dragging) 
       {
        mesh.rotation.z-=speedX/100;
           }
           createjs.Tween.get(mesh.rotation).to({z:0},1000);


        
    
        
        renderer.render(scene, camera);

    }


    function updateParams(){
    
    
    // sparo_top.rotation.y += settings.Move * Math.PI * 2;
    
    // var toRotate = coil.rotation.y;
    // // toRotate += (settings.Move-old) * Math.PI * 2;
    // toRotate = originalRotPos[0] + settings.Move * Math.PI * 2;
    // createjs.Tween.get(coil.rotation, { loop: false })
    // .to({ y: toRotate }, 1000, createjs.Ease.linear)

    // var moveTo = coil.position.y;
    // // moveTo -= (settings.Move-old) * 0.025;
    // moveTo = originalRotPos[1] - settings.Move * 0.025;
    // // sparo_top.position.y -=0.025
    // createjs.Tween.get(coil.position, { loop: false })
    // .to({ y: moveTo }, 1000, createjs.Ease.linear)

    


    // old = settings.Move;

    
    // animate();

    }

    

    function updatePhysics(dt){
        wire.physics.update(dt);
    }

