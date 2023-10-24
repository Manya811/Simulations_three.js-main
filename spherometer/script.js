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
    var sparo_base,sparo_top;
    var run;
    var resourcePaths=['checker.png'];
    var resources=[];
    var loadedResources=0;
    var old = 0;
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
        
        pane = new Tweakpane.Pane({container:document.getElementById("gui"),title:"Spherometer",expanded: true});
        // pane.addInput(settings, "intensity",{label:"Field Intensity",min:-1,max:1,step:0.01}).on('change',updateField);
        pane.addInput(settings, "Move",{label:"Move",min:0,max:22,step:0.1}).on('change',updateParams);
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
        scene.add( new THREE.AmbientLight( 0x222222,10 ) );

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
        light.shadow.darkness = 0;
        //light.shadowCameraVisible = true;
        //scene.add( new THREE.DirectionalLight(light, 2.5) );
        scene.add( light );

        // axes
        //scene.add( new THREE.AxesHelper( 20 ) );

        light = new THREE.PointLight( 0xffffff,7); // soft white light
        light.position.set(0,0,0);
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
    "./resources/Spherometer_main.mtl",
    function (materials) {
      materials.preload();

      new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/Spherometer_main.obj", function (object) {
            
            object.position.y = 0;
            object.position.z = 0;
            object.position.x = -1.5
            object.castShadow = true;
            console.log(object)
          
            object.rotation.x = 0
            // object.traverse(function (child) {
            //     child.castShadow = true;
            // });
            
          
            
        sparo_base = object;
        scene.add(object);
        
        
        
        });
    }
  );

  //   LOADING top
  new THREE.MTLLoader(manager).load(
    "./resources/untitled.mtl",
    function (materials) {
      materials.preload();

      new THREE.OBJLoader(manager)
        .setMaterials(materials)
        .load("./resources/untitled.obj", function (object) {
            
            object.position.y = 0.65;
            object.position.z = 0.055;
            object.position.x = -0.015
            object.castShadow = true;
            console.log(object)
          
            object.rotation.y = Math.PI + 0.03

            originalRotPos.push(object.rotation.y,object.position.y);
            object.traverse(function (child) {
                child.castShadow = true;
            });
            
          
            
        sparo_top = object;

        scene.add(object);
        
        
        
        });
    }
  );
    

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


        setTimeout(() => {  animate(); }, 100);
        
    }



    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( window.innerWidth, window.innerHeight );

    }

    function animate() {
        requestAnimationFrame( animate );
        
        if(run){
         
        }
        // sparo_top.rotation.y+=0.01;
        renderer.render(scene, camera);

    }


    function updateParams(){
    
    
    // sparo_top.rotation.y += settings.Move * Math.PI * 2;
    
    var toRotate = sparo_top.rotation.y;
    // toRotate += (settings.Move-old) * Math.PI * 2;
    toRotate = originalRotPos[0] + settings.Move * Math.PI * 2;
    createjs.Tween.get(sparo_top.rotation, { loop: false })
    .to({ y: toRotate }, 1000, createjs.Ease.linear)

    var moveTo = sparo_top.position.y;
    // moveTo -= (settings.Move-old) * 0.025;
    moveTo = originalRotPos[1] - settings.Move * 0.025;
    // sparo_top.position.y -=0.025
    createjs.Tween.get(sparo_top.position, { loop: false })
    .to({ y: moveTo }, 1000, createjs.Ease.linear)

    


    old = settings.Move;

    // sparo_top.update
    run = settings.isRunning;
    // animate();

    }

    

    function updatePhysics(dt){
        wire.physics.update(dt);
    }

