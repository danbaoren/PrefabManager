import * as RE from 'rogue-engine';
import * as THREE from 'three';
import AssetManager from "./AssetManager.re";
import AM_UI from "./AM_UI.re";

export default class AM_Handler {

  public static onDestroy() {
    const assman = AssetManager.get();
    const amui = AM_UI.get();
    
    // Remove prefab list UI
    if (assman.prefabListContainer && assman.prefabListContainer.parentElement) {
      assman.prefabListContainer.parentElement.removeChild(assman.prefabListContainer);
    }

    // Event listener cleanup
    document.removeEventListener('mousemove', assman.onMouseMoveBound);
    document.removeEventListener('keydown', assman.onKeyDownBound);
    document.removeEventListener('keyup', assman.onKeyUpBound);
    document.removeEventListener('pointerlockchange', assman.onPointerLockChangeBound);
    
    if (assman.domElement) {
      assman.domElement.removeEventListener('click', assman.onLeftClickBound);
    }
    if (AM_UI.deleteButtonElement) {
      AM_UI.deleteButtonElement.removeEventListener('click', AM_UI.onDeleteClickBound);
    }
    if (AM_UI.toggleHideButtonElement) {
      AM_UI.toggleHideButtonElement.removeEventListener('click', AM_UI.onToggleHideClickBound);
    }

    // Remove UI elements from DOM
    if (AM_UI.crosshairElement && AM_UI.crosshairElement.parentElement) {
      AM_UI.crosshairElement.parentElement.removeChild(AM_UI.crosshairElement);
    }
    if (AM_UI.objectMenuContainerElement && AM_UI.objectMenuContainerElement.parentElement) {
      AM_UI.objectMenuContainerElement.parentElement.removeChild(AM_UI.objectMenuContainerElement);
    }
    if (AM_UI.cameraLocationDisplay && AM_UI.cameraLocationDisplay.parentElement) {
      AM_UI.cameraLocationDisplay.parentElement.removeChild(AM_UI.cameraLocationDisplay);
    }
    // Save button cleanup
    if (AM_UI.saveButtonElement && AM_UI.saveButtonElement.parentElement) {
      AM_UI.saveButtonElement.parentElement.removeChild(AM_UI.saveButtonElement);
    }

    // Pointer lock and camera cleanup
    if (document.pointerLockElement === assman.domElement) {
      document.exitPointerLock();
    }
    if (assman.camera && assman.camera.parent === RE.Runtime.scene) {
      RE.Runtime.scene.remove(assman.camera);
      if (RE.App.activeCamera === assman.camera?.uuid) {
        RE.App.activeCamera = "";
      }
    }

    // Additional UI cleanup
    if (assman.prefabListContainer) {
      assman.prefabListContainer.innerHTML = '';
    }

    // Remove position/rotation/scale input listeners
    if (AM_UI.positionXInput) {
      AM_UI.positionXInput.removeEventListener('input', AM_UI.onPositionInputChangeBound);
    }
    if (AM_UI.rotationXInput) {
      AM_UI.rotationXInput.removeEventListener('input', AM_UI.onRotationInputChangeBound);
    }
    if (AM_UI.scaleXInput) {
      AM_UI.scaleXInput.removeEventListener('input', AM_UI.onScaleInputChangeBound);
    }

    // Remove UI toggle listener
    document.removeEventListener('keydown', AssetManager.get().toggleAllUIBound);
    
    // Remove wheel listeners
    document.removeEventListener('wheel', AssetManager.get().onPrefabWheelBound);

    // Clear stored styles via public method
    assman.cleanupUI();

    // Clear references
    assman.camera = undefined;
    assman.domElement = null;
    AM_UI.crosshairElement = null;
    AM_UI.objectMenuContainerElement = null;
    AM_UI.objectNameElement = null;
    AM_UI.deleteButtonElement = null;
    AM_UI.toggleHideButtonElement = null;
    AM_UI.selectedObject = null;
    assman.keysPressed = {};
    assman.excludedNamesArray = [];
    AM_UI.cameraLocationDisplay = null;
    assman.prefabListContainer = null; // Clear prefab-related references
    assman.availablePrefabs = [];       // Clear prefab-related references
    // Clear transform input references
    AM_UI.positionXInput = null;
    AM_UI.positionYInput = null;
    AM_UI.positionZInput = null;
    AM_UI.rotationXInput = null;
    AM_UI.rotationYInput = null;
    AM_UI.rotationZInput = null;
    AM_UI.scaleXInput = null;
    AM_UI.scaleYInput = null;
    AM_UI.scaleZInput = null;
    AM_UI.tpToCameraButton = null;
    AM_UI.saveButtonElement = null;

    // Clear all interval timers
    if (assman.cameraUpdateInterval) {
      clearInterval(assman.cameraUpdateInterval);
      assman.cameraUpdateInterval = null;
    }
  }

}
