"""
Exportação otimizada para o site (sem refazer modelagem nem bake).

    blender -b 3d/uta.blend --python 3d/export_web.py

- geometria com compressão Draco (posição 15 bits ≈ 0,4 mm na sala de 12,5 m;
  UV 14 bits ≈ 0,1 px no lightmap de 2048) → o site usa DRACOLoader
- texturas em WebP na mesma resolução
- panorama HDR dos reflexos em 768 × 384 (o three.js desfoca com PMREM de qualquer forma)

Também é chamado no fim de 3d/build_uta.py.
"""
import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def export_glb(path=None):
    path = path or os.path.join(ROOT, "models", "uta.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_image_format="WEBP",
        export_image_quality=86,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=15,
        export_draco_normal_quantization=11,
        export_draco_texcoord_quantization=14,
        export_draco_generic_quantization=12,
    )
    return path


def render_env_hdr(path=None, width=768):
    """panorama equiretangular da sala para os reflexos do site"""
    scene = bpy.context.scene
    path = path or os.path.join(ROOT, "models", "room_env.hdr")
    cam_data = bpy.data.cameras.new("Pano")
    cam_data.type = "PANO"
    try:
        cam_data.panorama_type = "EQUIRECTANGULAR"
    except Exception:
        cam_data.cycles.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("Pano", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (2.1, -2.6, 1.3)
    cam.rotation_euler = (math.radians(90), 0, 0)
    old_cam = scene.camera
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = width
    scene.render.resolution_y = width // 2
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "HDR"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    scene.camera = old_cam
    return path


def use_gpu():
    scene = bpy.context.scene
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for t in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = t
                prefs.refresh_devices()
                if any(d.type != "CPU" for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type != "CPU"
                    scene.cycles.device = "GPU"
                    return
            except Exception:
                continue
    except Exception:
        pass


if __name__ == "__main__":
    use_gpu()
    print("HDR", render_env_hdr())
    print("GLB", export_glb())
