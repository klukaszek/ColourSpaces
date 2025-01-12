import { WGPU_RENDERER } from "../main.js";
import { PPMTexture } from "../renderer.js";
import { PointCloud } from "./pointcloud.js";

export class LinearRGBCube extends PointCloud {
    private ComputeRGBCube = `
    struct Dimensions {
        resolution: u32,
        padding: vec3<u32>,  // Padding to maintain 16-byte alignment
    }

    @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;
    @group(0) @binding(1) var<uniform> dimensions: Dimensions;

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * dimensions.resolution * dimensions.resolution);
        if (index >= arrayLength(&vertices)) {
            return;
        }

        // Calculate 3D position within the grid
        let x = f32(index % dimensions.resolution);
        let y = f32((index / dimensions.resolution) % dimensions.resolution);
        let z = f32(index / (dimensions.resolution * dimensions.resolution));

        // Normalize coordinates to [0,1] range
        let color = vec3<f32>(
            x / f32(dimensions.resolution - 1u),
            y / f32(dimensions.resolution - 1u),
            z / f32(dimensions.resolution - 1u)
        );

        let pos_index = index * 6;
        
        // Position (same as color for RGB cube)
        vertices[pos_index] = color.r;
        vertices[pos_index + 1] = color.g;
        vertices[pos_index + 2] = color.b;

        // Color
        vertices[pos_index + 3] = color.r;
        vertices[pos_index + 4] = color.g;
        vertices[pos_index + 5] = color.b;
    }`;

    private RGBCubeFromPPM = `
    @group(0) @binding(0) var<storage, read_write> rgb: array<u32>;
    @group(0) @binding(1) var<storage, read_write> vertices: array<f32>;
    @group(0) @binding(2) var<uniform> dimensions: Dimensions;

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * dimensions.resolution * dimensions.resolution);
        if (index >= arrayLength(&vertices)) {
            return;
        }

        // Extract RGB values from input buffer
        let input = rgb[index];
        let r = f32(input & 0xFFu) / 255.0;
        let g = f32((input >> 8u) & 0xFFu) / 255.0;
        let b = f32((input >> 16u) & 0xFFu) / 255.0;
        let a = f32((input >> 24u) & 0xFFu) / 255.0;

        let pos_index = index * 6;

        // Position and color are the same for RGB cube
        vertices[pos_index] = r;
        vertices[pos_index + 1] = g;
        vertices[pos_index + 2] = b;

        vertices[pos_index + 3] = r;
        vertices[pos_index + 4] = g;
        vertices[pos_index + 5] = b;
    }`;
    
    private rgbComputePipeline: GPUComputePipeline | null = null;
    private rgbBGL: GPUBindGroupLayout;
    private rgbBindGroup: GPUBindGroup | null = null;
    private rgbBuffer: GPUBuffer | null = null;
    private dimensionsBuffer: GPUBuffer;
    private ppmTexture: PPMTexture | null = null;

    constructor(resolution: number) {
        let { ppmTexture, buffer } = WGPU_RENDERER.getPPMTextureData();
        
        let numPoints = resolution ** 3;
        if (ppmTexture !== undefined) {
            numPoints = ppmTexture.width * ppmTexture.height;
            resolution = Math.floor(Math.sqrt(numPoints)); // approximate cubic resolution from 2D texture
        }

        super(numPoints);
        this.numPoints = numPoints;

        // Create dimensions uniform buffer
        this.dimensionsBuffer = WGPU_RENDERER.device.createBuffer({
            size: 32, // uint32 + padding
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        // Write resolution to buffer
        new Uint32Array(this.dimensionsBuffer.getMappedRange()).set([resolution, 0, 0, 0]); // Include padding
        this.dimensionsBuffer.unmap();

        if (ppmTexture !== undefined) {
            this.ppmTexture = ppmTexture;
            this.rgbBuffer = buffer!;

            this.rgbBGL = WGPU_RENDERER.device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'uniform' }
                    }
                ]
            });

            this.rgbBindGroup = WGPU_RENDERER.device.createBindGroup({
                layout: this.rgbBGL,
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.rgbBuffer }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.vertexBuffer }
                    },
                    {
                        binding: 2,
                        resource: { buffer: this.dimensionsBuffer }
                    }
                ]
            });
            
            this.rgbComputePipeline = this.createComputePipeline(this.RGBCubeFromPPM, [this.rgbBGL], "RGB Kernel");
        } else {
            this.rgbBGL = WGPU_RENDERER.device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'uniform' }
                    }
                ]
            });

            this.rgbBindGroup = WGPU_RENDERER.device.createBindGroup({
                layout: this.rgbBGL,
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.vertexBuffer }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.dimensionsBuffer }
                    }
                ]
            });

            this.rgbComputePipeline = this.createComputePipeline(this.ComputeRGBCube, [this.rgbBGL], "RGB Kernel");
        }
    }

    public async generateCloud(): Promise<void> {
        this.computeBindGroup = this.rgbBindGroup;
        this.compute(this.rgbComputePipeline!, this.numPoints);
    }
}
