# Runtime configuration

The generic runtime config contains only serializable data. Each layer requires
`vegetationLayerId`, `key`, `enabled` and `renderProfile.type`; the selected layer module
owns every additional field and its validation.

```ts
const config = {
  configVersion: 3,
  layers: [grassPreset({ vegetationLayerId: 0, vegetationLayerKey: 'meadow-grass' })],
}
```

File layers without a matching config are ignored. Layers configured with
`enabled: false` are not prepared or uploaded. Enabling such a layer requires a
new runtime because no resources were created for it.

Grass types and defaults live in the Grass profile, not in this generic module.
Other profiles may define completely different serializable fields.
