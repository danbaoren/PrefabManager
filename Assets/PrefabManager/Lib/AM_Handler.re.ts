import * as RE from 'rogue-engine';
import * as THREE from 'three';
import AssetManager from "./AssetManager.re";

export default class AM_Handler {

  public static onDestroy() {
    const assman = AssetManager.get();
    
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
    if (assman.deleteButtonElement) {
      assman.deleteButtonElement.removeEventListener('click', assman.onDeleteClickBound);
    }
    if (assman.toggleHideButtonElement) {
      assman.toggleHideButtonElement.removeEventListener('click', assman.onToggleHideClickBound);
    }

    // Remove UI elements from DOM
    if (assman.crosshairElement && assman.crosshairElement.parentElement) {
      assman.crosshairElement.parentElement.removeChild(assman.crosshairElement);
    }
    if (assman.objectMenuContainerElement && assman.objectMenuContainerElement.parentElement) {
      assman.objectMenuContainerElement.parentElement.removeChild(assman.objectMenuContainerElement);
    }
    if (assman.cameraLocationDisplay && assman.cameraLocationDisplay.parentElement) {
      assman.cameraLocationDisplay.parentElement.removeChild(assman.cameraLocationDisplay);
    }
    // Save button cleanup
    if (assman.saveButtonElement && assman.saveButtonElement.parentElement) {
      assman.saveButtonElement.parentElement.removeChild(assman.saveButtonElement);
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
    if (assman.positionXInput) {
      assman.positionXInput.removeEventListener('input', assman.onPositionInputChangeBound);
    }
    if (assman.rotationXInput) {
      assman.rotationXInput.removeEventListener('input', assman.onRotationInputChangeBound);
    }
    if (assman.scaleXInput) {
      assman.scaleXInput.removeEventListener('input', assman.onScaleInputChangeBound);
    }

    // Remove UI toggle listener
    document.removeEventListener('keydown', assman.toggleAllUIBound);
    
    // Remove wheel listeners
    document.removeEventListener('wheel', assman.onPrefabWheelBound);

    // Clear stored styles via public method
    assman.cleanupUI();

    // Clear references
    assman.camera = undefined;
    assman.domElement = null;
    assman.crosshairElement = null;
    assman.objectMenuContainerElement = null;
    assman.objectNameElement = null;
    assman.deleteButtonElement = null;
    assman.toggleHideButtonElement = null;
    assman.selectedObject = null;
    assman.keysPressed = {};
    assman.excludedNamesArray = [];
    assman.cameraLocationDisplay = null;
    assman.prefabListContainer = null; // Clear prefab-related references
    assman.availablePrefabs = [];       // Clear prefab-related references
    // Clear transform input references
    assman.positionXInput = null;
    assman.positionYInput = null;
    assman.positionZInput = null;
    assman.rotationXInput = null;
    assman.rotationYInput = null;
    assman.rotationZInput = null;
    assman.scaleXInput = null;
    assman.scaleYInput = null;
    assman.scaleZInput = null;
    assman.tpToCameraButton = null;
    assman.saveButtonElement = null;

    // Clear all interval timers
    if (assman.cameraUpdateInterval) {
      clearInterval(assman.cameraUpdateInterval);
      assman.cameraUpdateInterval = null;
    }
  }

  public static updateRenderDistances(cameraPosition: THREE.Vector3) {
    // Update render distances for all prefabs based on camera position
    AssetManager.get().spawnedPrefabs.forEach((prefab) => {
      const distance = prefab.position.distanceTo(cameraPosition);
      if (distance > AssetManager.get().renderDistance) {
        prefab.visible = false;
      } else {
        prefab.visible = true;
      }
    });
  }
}
