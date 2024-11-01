import { CreateTableCommand, DynamoDB, GetItemCommand, ResourceInUseException } from "@aws-sdk/client-dynamodb"; // ES6 import
import { BatchGetCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { errAsync, ok, okAsync, Result, ResultAsync } from "neverthrow";
import { err, Err } from "neverthrow";
import { Resource } from "sst";
import { isErrored } from "stream";
import { AnyZodObject, z, ZodAny, ZodObject, ZodTypeAny } from "zod";
const dbClient = new DynamoDB({});
export const ddbDocClient = DynamoDBDocumentClient.from(dbClient); // client is DynamoDB client

type TableType<X> = X extends {type: 'sst.aws.Dynamo'}?X:never
type Res<X> = {[J in keyof X as X[J] extends {type: 'sst.aws.Dynamo'}?J:never]:X[J]}
type M = Res<typeof Resource>
type TableName = keyof M



const zFields = z.object({
    string: z.string().optional(),
    number: z.number().optional(),
    list: z.array(z.string()).optional(),
    json: z.string().optional()
})

type Fields=z.infer<typeof zFields>

class BadListEntry extends Error {}
const listToString=(list:string[])=>{
    if (list.some((a)=>a.includes('#'))) {
        return err(new BadListEntry('# is not allowed in DB string'))
    }
    return ok(list.join('#'))
}


export const FDbMakeId=()=>(Buffer.from(crypto.getRandomValues(new Uint8Array(20))).toString('hex'))

const zBase = z.object({
    FDBTableEntry:z.string(),
    FDBTenant: z.string(),
    FDBId: z.string(),
})

type tBase= typeof zBase

type FDBVisible = 'FDBId'
type FDBInternal = 'FDBTableEntry' | 'FDBTenant' 
type FDBKeys = FDBVisible | FDBInternal


const zListItem = zBase.extend({
    name: z.string(),
    value: z.string()
})

// const zListItem = z.object({
//     id: z.string(),
//     name: z.string(), 
//     value: z.string()
// })

type tListItem = typeof zListItem

type iBase = z.infer<tBase>

type FTableSchema = z.ZodType<iBase>

type FTable<Z extends FTableSchema> = {
    z: Z,
    name: string,
} 


const fListItem: FTable<tListItem> = {
    z: zListItem,
    name: 'ListItem'
} as const




type FDbTable<Z extends FTableSchema> = {
    put: (tenant:string, id:string, contents:Omit<z.infer<Z>, FDBKeys>)=>ResultAsync<void, unknown>;
    getOne: (tenant: string, id: string)=>ResultAsync<Omit<z.infer<Z>,FDBInternal>, unknown>;
    getAny: (tenant: string)=>ResultAsync<Omit<z.infer<Z>,FDBInternal>[], unknown>
    getBatch: (tenant: string, ids:string[])=>ResultAsync<Omit<z.infer<Z>,FDBInternal>[], unknown>
    delete:  (tenant:string, id:string)=>ResultAsync<void, unknown>
}

const fDbMakeTable = <F extends FTable<FTableSchema>>(table:F):FDbTable<F['z']>=>{
    return {
        put: (tenant:string, id:string, contents:Omit<z.infer<F['z']>, FDBKeys> )=>fDbStore<F>(table, tenant, id, contents),
        getOne: (tenant: string, id: string)=>fDbGetOne<F>(table, tenant, id),
        getAny: (tenant: string)=>fDBGetAny<F>(table, tenant),
        getBatch: (tenant: string, ids:string[])=>fDBGetBatch<F>(table, tenant, ids),
        delete: (tenant:string, id:string)=>fDbDelete(table, tenant, id)
    } as const
}

export const ListItem = fDbMakeTable(fListItem)
// ['UserName',<userName>,'UserId']:<userId>
// ['UserId',<userId>,'Credentials']:[<credId>,...]
// ['UserName',<userName>,'challenge']:<challenge>,<timeout>
// ['Credential,<credId>,'publicKey']:<publicKey>
// ['Credential,<credId>,'counter']:<counter>
// ['Credential',<credId>,'transports']:<transports>

const zCredential = z.object({
    id: z.string(),
    publicKey: z.array(z.number().int().min(0).max(255)),
    counter: z.number().int().min(0),
    transports: z.array(z.string())
})

export const UserItem = fDbMakeTable({
    z: zBase.extend({
        userName:z.string(),
        credentials: z.array(zCredential)
    }),
    name: 'UserItem'
} as const)
export const UserName = fDbMakeTable({
    z: zBase.extend({
        userId: z.string(),
        challenge:z.string(),
        challengeTimeout:z.number().int().min(0),
    }),
    name: 'UserName'
} as const)


const zAuthUser = zBase.extend({
    userName:z.string(),
    credentials: z.array(zCredential),
    challenge:z.string(),
    challengeTimeout:z.number().int().min(0)
})
type TAuthUser = typeof zAuthUser
type FDbAuthUser = z.infer<TAuthUser>
export type AuthUser = Omit<FDbAuthUser, FDBKeys>
const getBatchedUserNamesFromUserItems=(tenant: string, items:ReturnType<typeof UserItem['getAny']>)=>{
    const jres=items.andThen(r=>{
        const kres = UserName.getBatch(tenant, r.map(j=>j.userName)).andThen( p=>{
            const lres=r.map((f, i)=>({
                userName:f.userName,
                credentials:f.credentials,
                challenge: p[i].challenge,
                challengeTimeout: p[i].challengeTimeout
            }))
            return okAsync(lres)
        }
        )
        return errAsync('Bad')
    })
    return errAsync('Bad')
}

export const FBAuthUser:FDbTable<
    TAuthUser
> = {
    put: (tenant: string, id: string, contents:Omit<FDbAuthUser, FDBKeys>)=>{
        const res =  ResultAsync.combine([
            UserItem.put(tenant, id, {
                userName: contents.userName,
                credentials: contents.credentials
            }),
            UserName.put(tenant, contents.userName, {
                userId: id,
                challenge: contents.challenge,
                challengeTimeout: contents.challengeTimeout
            })
        ])
        return res.map(r=>{})

    },
    getOne: (tenant:string, id:string)=>{
        const res = UserItem.getOne(tenant, id).
                             andThen((jres)=>(
                                UserName.getOne(tenant, jres.userName)
                                    .andThen((kres)=>{
                                        return ok({
                                            FDBId: jres.FDBId,
                                            userName: jres.userName,
                                            credentials:jres.credentials,
                                            challenge: kres.challenge,
                                            challengeTimeout: kres.challengeTimeout
                                        })    
                                    })
                             ))
        return res
     
    },
    getAny: (tenant:string)=>{
        const res = UserItem.getAny(tenant)
        return getBatchedUserNamesFromUserItems(tenant, res)
    },
    getBatch: (tenant:string, ids:string[])=>{
        const res = UserItem.getBatch(tenant, ids)
        return getBatchedUserNamesFromUserItems(tenant, res)
    },
    delete: (tenant:string, id:string)=>{
        return UserItem
            .getOne(tenant, id)
            .andThen(j=>{
                return UserName
                    .delete(tenant,j.userName)
                    .map(k=>{})
            })
    }
}
const fDbDelete=<F extends FTable<FTableSchema>>(table:F, tenant:string,  id:string)=>{
    const keyStr = `${table.name}#${id}`
    const res = ResultAsync.fromThrowable(async ()=>(await ddbDocClient.send( 
        new DeleteCommand({
            TableName: Resource.FunkyDBTable.name,
            Key: {
                FDBTenant: tenant,
                FDBTableEntry: keyStr,
            }
        })
    )),(e)=>e)()
    return res.map(()=>{})
}


const fDbStore=<F extends FTable<FTableSchema>>(table:F, tenant:string,  id:string, contents:Omit<z.infer<F['z']>, FDBKeys> )=>{
    const keyStr = `${table.name}#${id}`
    console.log('STORE', keyStr, contents)
    const res = ResultAsync.fromThrowable(async ()=>(await ddbDocClient.send( 
        new PutCommand({
            TableName: Resource.FunkyDBTable.name,
            Item: {
                FDBTenant: tenant,
                FDBTableEntry: keyStr,
                FDBId: id,
                ...contents
            }
        })
    )),(e)=>e)()
    return res.map(()=>{})
}
const fDbGetOne=<F extends FTable<FTableSchema>>(table:F, tenant:string,  id:string )=>{
    const keyStr = `${table.name}#${id}`
    console.log('GeetOne',tenant, keyStr)
    type O = Omit<z.infer<F['z']>,FDBInternal>
    const r = ResultAsync.fromThrowable(async ()=>{
        const res = await ddbDocClient.send( 
            new GetCommand({
                TableName: Resource.FunkyDBTable.name,
                Key: {
                    FDBTenant: tenant,
                    FDBTableEntry: keyStr,
                }
            })
        )
        const out = table.z.parse(res.Item) as unknown as O
        return out
    })()

    return r
}

const fDBGetAny=<F extends FTable<FTableSchema>>(table:F, tenant:string)=>{
    type O = Omit<z.infer<F['z']>,FDBInternal>
    const keyStr = `${table.name}#`
    const res = ResultAsync.fromThrowable(async ()=>{
        const u = await ddbDocClient.send( 
            new QueryCommand({
                ExpressionAttributeValues: {
                    ':ktenant' : tenant,
                    ':ktable'  : keyStr,
                },
                TableName: Resource.FunkyDBTable.name,
                KeyConditionExpression: " FDBTenant = :ktenant and begins_with(FDBTableEntry, :ktable)",

            })
        )
        return (u.Items??[]).map((j)=>(table.z.parse(j)as unknown as O))
    })()

    return res
}

const fDBGetBatch=<F extends FTable<FTableSchema>>(table:F, tenant:string, ids: string[])=>{
    type O = Omit<z.infer<F['z']>,FDBInternal>


    const keys=ids.map(i=>({
        "FDBTenant":tenant,
        "FDBTableEntry":`${table.name}#${i}`
    }))

    const res = ResultAsync.fromThrowable(async ()=>{
        const u = await ddbDocClient.send( 
            new BatchGetCommand({
                RequestItems: {
                    [Resource.FunkyDBTable.name]: {
                        "Keys": keys
                    }
                }
            })
        )
        return (u.Responses?.[Resource.FunkyDBTable.name]??[]).map((j)=>(table.z.parse(j)as unknown as O))
    })()

    return res
}






// export const dbStore=(table:TableName, hash:string, list:string[], fields:Fields)=>{
//     const keyStr = listToString(list)
//     if (keyStr.isErr()) return errAsync(keyStr.error)
//     const res = ResultAsync.fromThrowable(async ()=>(await ddbDocClient.send( 
//         new PutCommand({
//             TableName: table,
//             Item: {
//                 hash: hash,
//                 search: keyStr.value,
//                 ...fields
//             }
//         })
//     )),(e)=>e)()
    
//     return res.map(()=>{})
// }

// export const dbGetMany = (table:TableName, hash:string, list:string[])=>{
//     const keyStr = listToString(list)
//     if (keyStr.isErr()) return keyStr
// }

// export const dbGetOne = async (table:TableName, hash:string, list:string[])=>{

//     const keyStr = listToString(list)
//     if (keyStr.isErr()) return keyStr
//     const res = await ResultAsync.fromThrowable(async ()=>(await ddbDocClient.send( 
//         new GetCommand({
//             TableName: table,
//             Key: {
//                 hash: hash,
//                 search: keyStr.value
//             }
//         })
//     )))()
//     if ( res.isErr()) return res
//     const out = Result.fromThrowable(zFields.parse)(res.value.Item)
//     return out
// }




// All Tables are indexed by hashkey & funId

// const crud=<T extends z.ZodType<AnyZodObject>>(model: T, tableName: keyof M)=>{
//     const crudModel = model.and(z.object({
//         FunCounter: z.number().int(),
//         FunId: z.string()
//     }))
//     type crudType=z.infer<typeof crudModel>
//     const primary = Resource.ListTable.type
//     const table = Resource[tableName].name
//     type BaseType = z.infer<T>
//     return {
//         create: async (item: BaseType)=>{
//             const id = Buffer.from(crypto.getRandomValues(new Uint8Array(20))).toString('hex')
//             const newItem:crudType =  {
//                 ...item,
//                 FunCounter: 0,
//                 FunId: id
//               }
//             await ddbDocClient.send(
//                 new PutCommand({
//                   TableName: table,
//                   Item: newItem
//                 })
//             )
//             return newItem

//         },
//         read:()=>{},
//         readMany:()=>{},
//         scan:()=>{},
//         update: ()=>{},
//         delete: ()=>{},
//     }
// }