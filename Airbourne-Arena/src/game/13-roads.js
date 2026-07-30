/* --- continuous terrain-conforming road network ---
   Roads and city lots share the same 134-unit planning grid. Each route is a
   single triangulated ribbon sampled against the terrain at both shoulders:
   no floating box segments, gaps, or unrelated streets through buildings. */
var proceduralRoads=new THREE.Group();scene.add(proceduralRoads);
(function buildRoads(){
  var routes=[
    [[-BASE_X,0],[BASE_X,0]],
    [[-CITY_REACH,-1340],[CITY_REACH,-1340]],
    [[-CITY_REACH,-670],[CITY_REACH,-670]],
    [[-CITY_REACH,670],[CITY_REACH,670]],
    [[-CITY_REACH,1340],[CITY_REACH,1340]],
    [[-1340,-CITY_REACH],[-1340,CITY_REACH]],
    [[-670,-CITY_REACH],[-670,CITY_REACH]],
    [[0,-CITY_REACH],[0,CITY_REACH]],
    [[670,-CITY_REACH],[670,CITY_REACH]],
    [[1340,-CITY_REACH],[1340,CITY_REACH]]
  ],STEP_R=38;
  /* The masterplan has a recognisable civic ring instead of a grid that simply
     stops at the authored district. It gives every radial avenue somewhere to
     go and stays legible from the normal chase camera. */
  var ring=[],RING_R=ROAD_RING_R,RING_STEPS=64;
  for(var ra=0;ra<=RING_STEPS;ra++){
    var ang=ra/RING_STEPS*Math.PI*2;
    ring.push([Math.cos(ang)*RING_R,Math.sin(ang)*RING_R]);
  }
  routes.push(ring);
  /* Short radial links join the ring to the central operations quarter. */
  for(var spoke=0;spoke<8;spoke++){
    var sa=spoke*Math.PI/4,c=Math.cos(sa),s=Math.sin(sa);
    routes.push([[c*250,s*250],[c*RING_R,s*RING_R]]);
  }
  /* Airbase perimeter roads make each runway precinct a complete destination,
     not a runway with one road vanishing into its threshold. */
  [-1,1].forEach(function(side){
    var bx=side*BASE_X,loop=[],rx=370,rz=300;
    for(var li=0;li<=32;li++){
      var la=li/32*Math.PI*2;
      loop.push([bx+Math.cos(la)*rx,Math.sin(la)*rz]);
    }
    routes.push(loop);
    routes.push([[side*(RING_R+20),0],[side*(BASE_X-rx),0]]);
  });
  var mat=new THREE.MeshPhongMaterial({map:roadSkin,color:0xffffff,shininess:3,
    polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-2});
  var shoulderMat=new THREE.MeshPhongMaterial({color:0x343a3c,shininess:1,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  function roadRibbon(points,half,material,yLift){
    var positions=[],uvs=[],indices=[];
    var travelled=0;
    for(var pi=0;pi<points.length;pi++){
      var prev=points[Math.max(0,pi-1)],next=points[Math.min(points.length-1,pi+1)];
      var dx=next[0]-prev[0],dz=next[1]-prev[1],dl=Math.max(.001,Math.hypot(dx,dz));
      var nx=-dz/dl,nz=dx/dl,cx=points[pi][0],cz=points[pi][1];
      if(pi)travelled+=Math.hypot(cx-points[pi-1][0],cz-points[pi-1][1]);
      var lx=cx+nx*half,lz=cz+nz*half,rx=cx-nx*half,rz=cz-nz*half;
      positions.push(lx,ground(lx,lz)+yLift,lz,rx,ground(rx,rz)+yLift,rz);
      uvs.push(0,travelled/90,1,travelled/90);
      if(pi<points.length-1){
        var k=pi*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);
      }
    }
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geo.setIndex(indices);geo.computeVertexNormals();
    proceduralRoads.add(new THREE.Mesh(geo,material));
  }
  for(var ri=0;ri<routes.length;ri++){
    var P=routes[ri],sampled=[P[0]];
    for(var seg=1;seg<P.length;seg++){
      var a=P[seg-1],b=P[seg],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      var n=Math.max(1,Math.ceil(len/STEP_R));
      for(var si=1;si<=n;si++){
        var t=si/n;sampled.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
      }
    }
    roadRibbon(sampled,42,shoulderMat,1.35);
    roadRibbon(sampled,34,mat,1.8);
  }
})();

