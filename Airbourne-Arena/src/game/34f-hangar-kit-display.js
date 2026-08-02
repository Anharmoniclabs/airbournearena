/* ===================== hangar kit display =====================
   The generated flight suit and the five arena weapons, stood up opposite the
   mission board so the loadout is something you walk past on the way out
   rather than a list behind a menu.

   The suit is a display stand, not a character. It was generated unrigged and
   in a T-pose — exactly wrong for a combatant, exactly right for a suit on a
   mannequin — so every animated role in the game still belongs to the rigged
   pilot in 34-hangar-characters.js. The note on that entry in the generated-art
   manifest is the reason, and is where a change should start if this ever
   becomes a real character.

   This is a separate part rather than a block in 33-hangar.js because it reads
   ARENA_ARMS while building, and the arsenal that declares it is assembled
   after the hangar. Hoisting covers a call made later; it does not cover a
   value read at load time. */
(function kitDisplay(){
  var plinth=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.7,.34,20),
    new THREE.MeshPhongMaterial({map:aviationHardwareSkin,color:0x59636d,shininess:22}));
  plinth.position.set(-11,.17,-27);hangarScene.add(plinth);
  var spot=new THREE.PointLight(0xdfeaff,1.5,26);
  spot.position.set(-11,7.4,-26);hangarScene.add(spot);
  afterBoot(function(){loadGeneratedArt('assets/arena-pilot-v1.glb',function(suit){
    suit.position.set(-11,.34,-27);
    suit.rotation.y=.5;
    hangarScene.add(suit);
  });});

  var rackMat=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,color:0x4e565f,shininess:16});
  var rack=new THREE.Mesh(new THREE.BoxGeometry(7.4,.28,1.1),rackMat);
  rack.position.set(-15.5,2.5,-29.4);hangarScene.add(rack);
  for(var leg=-1;leg<=1;leg+=2){
    var post=new THREE.Mesh(new THREE.BoxGeometry(.24,2.5,.24),rackMat);
    post.position.set(-15.5+leg*3.4,1.25,-29.4);hangarScene.add(post);
  }
  /* Hung muzzle-up in a row so the silhouettes read against the wall panel
     instead of overlapping each other end to end. */
  ARENA_ARMS.forEach(function(arm,i){
    afterBoot(function(){loadGeneratedArt(arm.asset,function(model){
      model.position.set(-18.6+i*1.55,3.5,-29.3);
      model.rotation.set(Math.PI*.5,0,.12);
      hangarScene.add(model);
    });});
  });
})();
