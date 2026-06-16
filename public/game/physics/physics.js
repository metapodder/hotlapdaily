export function capturePhysicsValues(carController, scale, canvasWidth = null, canvasHeight = null) {
    return {
        baseSpeedMultiplier: 1.82,
        baseTurnSpeed: 0.05,
        frameTimeMs: 16.67,
        carScaleRatio: 2.78,
        // Actual values from the game (for validation)
        actualBaseSpeed: carController.baseSpeed,
        actualBaseTurnSpeed: carController.baseTurnSpeed,
        actualScale: carController.scale,
        scaleInput: scale,
        // Canvas dimensions for additional validation
        canvasWidth: canvasWidth,
        canvasHeight: canvasHeight
    };
}

export function validatePhysicsValues(physicsData) {
    const tolerance = 0.001;
    
    // Calculate expected values
    const expectedBaseSpeed = (physicsData.baseSpeedMultiplier / physicsData.frameTimeMs) * physicsData.scaleInput;
    const expectedBaseTurnSpeed = physicsData.baseTurnSpeed / physicsData.frameTimeMs;
    const expectedScale = physicsData.carScaleRatio * physicsData.scaleInput;
    
    // Validate each value
    const validations = {
        speedValid: Math.abs(physicsData.actualBaseSpeed - expectedBaseSpeed) < tolerance,
        turnSpeedValid: Math.abs(physicsData.actualBaseTurnSpeed - expectedBaseTurnSpeed) < tolerance,
        scaleValid: Math.abs(physicsData.actualScale - expectedScale) < tolerance
    };
    
    const allValid = validations.speedValid && validations.turnSpeedValid && validations.scaleValid;
    
    if (!allValid) {
        console.warn('🚫 Physics validation failed:', {
            expected: { expectedBaseSpeed, expectedBaseTurnSpeed, expectedScale },
            actual: { 
                speed: physicsData.actualBaseSpeed, 
                turnSpeed: physicsData.actualBaseTurnSpeed, 
                scale: physicsData.actualScale 
            },
            validations
        });
    }
    
    // Return the complete physics data with validation result and canvas info
    return {
        baseSpeedMultiplier: physicsData.baseSpeedMultiplier,
        baseTurnSpeed: physicsData.baseTurnSpeed,
        frameTimeMs: physicsData.frameTimeMs,
        carScaleRatio: physicsData.carScaleRatio,
        canvasWidth: physicsData.canvasWidth,
        canvasHeight: physicsData.canvasHeight,
        isValid: allValid,
        violations: allValid ? [] : Object.keys(validations).filter(key => !validations[key])
    };
}

