import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();(async()=>{const x=await p.product.findFirst({where:{productCode:{startsWith:"LAB-"}},select:{id:true,productCode:true}});console.log(`${x?.id||""} ${x?.productCode||""}`);})().catch(()=>{}).finally(()=>p.$disconnect());
