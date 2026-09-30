# Worker dataset creation

The main-thread adapter transfers VEGFILE bytes and configuration to a Worker.
The Worker endpoint parses the file and creates the renderer-independent
dataset.

```text
WorkerVegFileDatasetCreationAdapter
  -> VegFileDatasetCreationWorkerEndpoint
  -> VegFileDatasetCreationManager
     -> VEGFILE v2 parser
     -> runtime dataset creation
```

`WorkerVegFileDatasetCreationAdapter` transfers a copy of the VEGFILE bytes so
the consumer's original buffer remains usable. An optional `cancellationSignal`
terminates an in-flight Worker when its result is no longer needed, for example
after a scene unmount or when a changed setup request replaces the current one.

The Worker entry must register the required profile preparations because module
functions cannot cross the Worker boundary. Only shared arrays and buffers
reported by prepared profiles are transferred back. There is no built-in
main-thread fallback; a project that needs one must provide its own
`VegFileDatasetCreationAdapter`.
