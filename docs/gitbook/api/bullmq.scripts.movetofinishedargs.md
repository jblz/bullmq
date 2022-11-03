<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [bullmq](./bullmq.md) &gt; [Scripts](./bullmq.scripts.md) &gt; [moveToFinishedArgs](./bullmq.scripts.movetofinishedargs.md)

## Scripts.moveToFinishedArgs() method

<b>Signature:</b>

```typescript
static moveToFinishedArgs<T = any, R = any, N extends string = string>(queue: MinimalQueue, job: Job<T, R, N>, val: any, propVal: FinishedPropValAttribute, shouldRemove: boolean | number | KeepJobs, target: FinishedStatus, token: string, fetchNext?: boolean): string[];
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  queue | [MinimalQueue](./bullmq.minimalqueue.md) |  |
|  job | [Job](./bullmq.job.md)<!-- -->&lt;T, R, N&gt; |  |
|  val | any |  |
|  propVal | [FinishedPropValAttribute](./bullmq.finishedpropvalattribute.md) |  |
|  shouldRemove | boolean \| number \| [KeepJobs](./bullmq.keepjobs.md) |  |
|  target | [FinishedStatus](./bullmq.finishedstatus.md) |  |
|  token | string |  |
|  fetchNext | boolean |  |

<b>Returns:</b>

string\[\]
