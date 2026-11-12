import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, motion, radius, roleColor, spacing, typography, type DesignRole } from '../tokens';

export function Button({ label, onPress, role = 'client', variant = 'primary', loading = false, disabled = false, style }: { label: string; onPress: () => void; role?: DesignRole; variant?: 'primary'|'secondary'|'quiet'|'danger'; loading?: boolean; disabled?: boolean; style?: ViewStyle }) {
 const bg = variant === 'primary' ? roleColor(role) : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.white : 'transparent';
 const fg = variant === 'primary' || variant === 'danger' ? colors.white : colors.ink;
 return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }} disabled={disabled || loading} onPress={onPress} style={({pressed})=>[s.button,{backgroundColor:bg,borderWidth:variant==='secondary'?1:0,borderColor:colors.border,opacity:disabled?.48:pressed?.9:1,transform:[{scale:pressed?motion.pressScale:1}]},style]}>{loading?<ActivityIndicator color={fg}/>:<Text style={[typography.caption,{color:fg,fontWeight:'800'}]}>{label}</Text>}</Pressable>;
}
export function Input({ label, hint, error, ...props }: TextInputProps & {label:string;hint?:string;error?:string}) {
 const [focused,setFocused]=useState(false);
 return <View style={{gap:spacing.xs}}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor={colors.muted} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={[s.input,{borderColor:error?colors.danger:focused?colors.cobalt:colors.border}]} {...props}/>{error?<Text style={[typography.tiny,{color:colors.danger}]}>{error}</Text>:hint?<Text style={[typography.tiny,{color:colors.muted}]}>{hint}</Text>:null}</View>;
}
export function SearchInput(props: TextInputProps) { return <View style={s.search}><Text style={{fontSize:18,color:colors.muted}}>⌕</Text><TextInput placeholder="¿Qué necesitas hoy?" placeholderTextColor={colors.muted} style={s.searchInput} returnKeyType="search" {...props}/></View>; }
export function Badge({label,tone='neutral'}:{label:string;tone?:'neutral'|'info'|'success'|'warning'|'pro'}) { const palette=tone==='success'?['#E7F7F0',colors.success]:tone==='warning'?['#FFF0EC',colors.warning]:tone==='pro'?['#FFF0EC',colors.coral]:tone==='info'?['#E9EDFF',colors.cobaltDark]:[colors.surfaceMuted,colors.muted]; return <View style={[s.badge,{backgroundColor:palette[0]}]}><Text style={[typography.tiny,{color:palette[1],fontWeight:'800'}]}>{label}</Text></View>; }
export function Chip({label,selected=false,onPress,role='client'}:{label:string;selected?:boolean;onPress:()=>void;role?:DesignRole}) { return <Pressable onPress={onPress} style={[s.chip,selected&&{backgroundColor:roleColor(role),borderColor:roleColor(role)}]}><Text style={[typography.caption,{fontWeight:'700',color:selected?colors.white:colors.ink}]}>{label}</Text></Pressable>; }
export function Card({children,style}:{children:ReactNode;style?:ViewStyle}) { return <View style={[s.card,style]}>{children}</View>; }
export function ServiceCard({title,subtitle,image,onPress,role='client'}:{title:string;subtitle?:string;image:ImageSourcePropType;onPress:()=>void;role?:DesignRole}) { return <Pressable onPress={onPress} style={({pressed})=>[s.serviceCard,{opacity:pressed?.92:1}]}><Image source={image} resizeMode="cover" style={s.serviceImage}/><View style={{gap:3}}><Text style={typography.h3}>{title}</Text>{subtitle?<Text style={[typography.tiny,{color:colors.muted}]}>{subtitle}</Text>:null}</View><View style={[s.serviceAccent,{backgroundColor:roleColor(role)}]}/></Pressable>; }
export function ProfessionalCard({name,profession,rating,price,avatar,onPress}:{name:string;profession:string;rating:string;price:string;avatar?:ImageSourcePropType;onPress:()=>void}) { return <Pressable onPress={onPress} style={s.proCard}>{avatar?<Image source={avatar} style={s.avatar}/>:<View style={[s.avatar,{backgroundColor:colors.surfaceBlue,alignItems:'center',justifyContent:'center'}]}><Text style={typography.h3}>{name.slice(0,1).toUpperCase()}</Text></View>}<View style={{flex:1,gap:3}}><Text style={[typography.caption,{fontWeight:'800'}]}>{name}</Text><Text style={[typography.tiny,{color:colors.muted}]}>{profession} · ★ {rating}</Text><Text style={[typography.tiny,{fontWeight:'800',color:colors.ink}]}>{price}</Text></View></Pressable>; }
export function EmptyState({title,message,action}:{title:string;message:string;action?:ReactNode}) { return <View style={s.empty}><View style={s.emptyMark}/><Text style={typography.h3}>{title}</Text><Text style={[typography.caption,{color:colors.muted,textAlign:'center',maxWidth:280}]}>{message}</Text>{action}</View>; }
export function Skeleton({width='100%',height=16}:{width?:number|string;height?:number}) { return <View style={{width,height,borderRadius:radius.md,backgroundColor:colors.surfaceMuted}}/>; }
export function BottomSheet({visible,onClose,children,snap='55%'}:{visible:boolean;onClose:()=>void;children:ReactNode;snap?:'20%'|'55%'|'90%'}) { return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><Pressable style={s.scrim} onPress={onClose}/><View style={[s.sheet,{height:snap}]}><View style={s.handle}/><Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={s.close}><Text style={typography.h3}>×</Text></Pressable><ScrollView contentContainerStyle={{paddingBottom:spacing.xl}}>{children}</ScrollView></View></Modal>; }
export function Avatar({source,size=44}:{source?:ImageSourcePropType;size?:number}) { return source?<Image source={source} style={{width:size,height:size,borderRadius:size/2}}/>:<View style={{width:size,height:size,borderRadius:size/2,backgroundColor:colors.surfaceBlue}}/>; }
export function Rating({value,count}:{value:string;count?:number}) { return <Text style={[typography.caption,{fontWeight:'800'}]}>★ {value}{count!==undefined?<Text style={{color:colors.muted,fontWeight:'500'}}> ({count})</Text>:null}</Text>; }
export function Header({title,subtitle,leading,trailing}:{title:string;subtitle?:string;leading?:ReactNode;trailing?:ReactNode}) { return <View style={s.header}>{leading}<View style={{flex:1,gap:2}}><Text style={typography.h2}>{title}</Text>{subtitle?<Text style={[typography.caption,{color:colors.muted}]}>{subtitle}</Text>:null}</View>{trailing}</View>; }
export function MapControl({label,onPress}:{label:string;onPress:()=>void}) { return <Pressable onPress={onPress} style={s.mapControl}><Text style={typography.tiny}>{label}</Text></Pressable>; }
export function SectionHeader({title,action,onAction}:{title:string;action?:string;onAction?:()=>void}) { return <View style={s.header}><Text style={typography.h2}>{title}</Text>{action&&onAction?<Pressable onPress={onAction}><Text style={[typography.caption,{color:colors.cobalt,fontWeight:'800'}]}>{action}</Text></Pressable>:null}</View>; }

const s=StyleSheet.create({
 button:{minHeight:52,paddingHorizontal:spacing.lg,borderRadius:radius.lg,alignItems:'center',justifyContent:'center'},
 label:{...typography.caption,fontWeight:'700',color:colors.ink},
 input:{minHeight:54,paddingHorizontal:spacing.base,borderWidth:1.5,borderRadius:radius.lg,color:colors.ink,backgroundColor:colors.white,fontSize:16},
 search:{minHeight:58,backgroundColor:colors.white,borderWidth:1,borderColor:colors.border,borderRadius:radius.xl,paddingHorizontal:spacing.base,flexDirection:'row',alignItems:'center',gap:spacing.sm},
 searchInput:{flex:1,minHeight:52,fontSize:16,color:colors.ink},
 badge:{alignSelf:'flex-start',paddingHorizontal:spacing.md,paddingVertical:spacing.xs,borderRadius:radius.pill},
 chip:{minHeight:44,paddingHorizontal:spacing.base,borderRadius:radius.pill,borderWidth:1,borderColor:colors.border,backgroundColor:colors.white,justifyContent:'center'},
 card:{backgroundColor:colors.white,borderRadius:radius.xl,borderWidth:1,borderColor:colors.border,padding:spacing.lg},
 serviceCard:{width:160,gap:spacing.sm,backgroundColor:colors.white,borderRadius:radius.xl,padding:spacing.sm,borderWidth:1,borderColor:colors.border,overflow:'hidden'},
 serviceImage:{width:'100%',height:116,borderRadius:radius.lg,backgroundColor:colors.surfaceMuted},
 serviceAccent:{height:3,width:32,borderRadius:radius.pill,position:'absolute',top:spacing.sm,left:spacing.sm},
 proCard:{minWidth:260,flexDirection:'row',alignItems:'center',gap:spacing.md,padding:spacing.md,borderWidth:1,borderColor:colors.border,borderRadius:radius.xl,backgroundColor:colors.white},
 avatar:{width:52,height:52,borderRadius:26,backgroundColor:colors.surfaceMuted},
 empty:{alignItems:'center',justifyContent:'center',gap:spacing.md,padding:spacing['2xl']},
 emptyMark:{width:54,height:54,borderRadius:27,backgroundColor:colors.surfaceBlue},
 scrim:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(23,27,45,0.35)'},
 sheet:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:colors.ivory,borderTopLeftRadius:radius['2xl'],borderTopRightRadius:radius['2xl'],paddingHorizontal:spacing.lg,paddingTop:spacing.md,overflow:'hidden'},
 handle:{alignSelf:'center',width:38,height:4,borderRadius:4,backgroundColor:'#C8C5BD',marginBottom:spacing.lg},
 close:{position:'absolute',right:spacing.md,top:spacing.sm,zIndex:2,width:40,height:40,alignItems:'center',justifyContent:'center'},
 header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:spacing.md},
 mapControl:{minHeight:42,paddingHorizontal:spacing.md,borderRadius:radius.pill,backgroundColor:colors.white,justifyContent:'center',...{shadowColor:colors.ink,shadowOpacity:.1,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2}},
});
